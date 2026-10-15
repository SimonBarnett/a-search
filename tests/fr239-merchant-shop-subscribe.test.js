'use strict';

/**
 * FR-239 / #1353: per-shop GBP 20 Stripe subscription + shared webhook.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-239.md');
const STACK = path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js');
const MIGRATION = path.join(
  ROOT,
  'db',
  'migrations',
  '015_ShopInvoices_StripeEvents.sql',
);

const { createShopsRegistry } = require('../shared/shops/registry');
const { createStripeEventStore } = require('../shared/shops/stripeEvents');
const { createShopInvoicesStore } = require('../shared/shops/shopInvoices');
const {
  createPartFeedKeysStore,
  createShopSyncQueue,
  createPartsStore,
} = require('../shared/shops/shopSync');
const {
  ASE_PRODUCT_SHOP,
  ASE_PRODUCT_WIDGET,
  canStartSubscribe,
  startShopSubscribe,
  cancelShopSubscription,
  mapSubscriptionStatus,
  applyMerchantShopStripeEvent,
} = require('../shared/shops/subscribe');
const {
  handleMerchantShopsSubscribe,
  handleMerchantShopsCancel,
  matchMerchantShopsRoute,
} = require('../entry/src/merchantShops');
const {
  handleStripeWebhook,
  matchStripeWebhookRoute,
  verifyStripeSignature,
} = require('../entry/src/stripeWebhook');
const { handler } = require('../entry/src/index');

function seedPendingShop(shops, opts = {}) {
  return shops.upsertConnect({
    merchantUserId: opts.merchantUserId || 'm1',
    env: opts.env || 'live',
    provider: opts.provider || 'fixture',
    providerShopId: opts.providerShopId || 'prov_' + Math.random().toString(16).slice(2, 8),
    shopDomain: opts.shopDomain || 'https://shop.example.com',
    displayName: opts.displayName || 'Example',
    nowMs: opts.nowMs || Date.now(),
  });
}

function stripeEvent(type, object, id) {
  return {
    id: id || 'evt_' + crypto.randomBytes(6).toString('hex'),
    type,
    data: { object },
  };
}

describe('FR-239 merchant shop subscribe', () => {
  it('docs Decision LOCKED; ASCII no-BOM; migration + CDK routes', () => {
    const buf = fs.readFileSync(FR_DOC);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    for (const b of buf) assert.ok(b < 128, 'FR-239.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /merchant_shop/);
    assert.match(text, /widget_upgrade/);
    assert.match(text, /SHOP_MONTHLY_PRICE_ID/);
    assert.match(text, /ShopInvoices/);
    assert.match(text, /FR-251/);
    assert.match(text, /\/merchant\/shops\/\{shopId\}\/subscribe/);
    assert.ok(fs.existsSync(MIGRATION));
    const mig = fs.readFileSync(MIGRATION, 'utf8');
    assert.match(mig, /ShopInvoices/);
    assert.match(mig, /StripeEvents/);
    assert.match(mig, /SubscriptionStatus/);
    assert.match(mig, /madeiradb|FR-251/i);
    const stack = fs.readFileSync(STACK, 'utf8');
    assert.match(stack, /\/merchant\/shops\/\{shopId\}\/subscribe/);
    assert.match(stack, /\/merchant\/shops\/\{shopId\}\/cancel/);
    assert.match(stack, /\/webhooks\/stripe/);
  });

  it('product constants pin merchant_shop vs widget_upgrade (no partner_monthly)', () => {
    assert.equal(ASE_PRODUCT_SHOP, 'merchant_shop');
    assert.equal(ASE_PRODUCT_WIDGET, 'widget_upgrade');
    const src = fs.readFileSync(
      path.join(ROOT, 'shared', 'shops', 'subscribe.js'),
      'utf8',
    );
    // May mention partner_monthly only as a forbidden value in comments.
    assert.doesNotMatch(src, /aSearchProduct:\s*['"]partner_monthly['"]/);
    assert.doesNotMatch(src, /=\s*['"]partner_monthly['"]/);
  });

  it('canStartSubscribe only pending_payment or suspended(payment)', () => {
    assert.equal(canStartSubscribe({ status: 'pending_payment' }), true);
    assert.equal(
      canStartSubscribe({ status: 'suspended', suspendReason: 'payment' }),
      true,
    );
    assert.equal(
      canStartSubscribe({ status: 'suspended', suspendReason: 'auth' }),
      false,
    );
    assert.equal(canStartSubscribe({ status: 'live' }), false);
    assert.equal(canStartSubscribe({ status: 'cancelled' }), false);
  });

  it('mapSubscriptionStatus covers FR-239 table', () => {
    assert.deepEqual(mapSubscriptionStatus('active'), {
      subscriptionStatus: 'active',
      shopAction: 'live',
    });
    assert.equal(mapSubscriptionStatus('trialing').shopAction, 'live');
    assert.equal(mapSubscriptionStatus('past_due').shopAction, 'stay_live');
    assert.equal(
      mapSubscriptionStatus('unpaid').shopAction,
      'suspended_payment',
    );
    assert.equal(mapSubscriptionStatus('canceled').shopAction, 'cancelled');
  });

  it('startShopSubscribe returns checkoutUrl with merchant_shop metadata', async () => {
    const shops = createShopsRegistry();
    const shop = seedPendingShop(shops);
    let captured;
    const started = await startShopSubscribe({
      shops,
      shopId: shop.shopId,
      merchantUserId: 'm1',
      priceId: 'price_shop_test',
      createCheckoutSession: async (opts) => {
        captured = opts;
        return { id: 'cs_test', url: 'https://checkout.stripe.com/c/pay/test' };
      },
      ensureStripeCustomer: async () => 'cus_m1',
    });
    assert.equal(started.checkoutUrl, 'https://checkout.stripe.com/c/pay/test');
    assert.equal(captured.mode, 'subscription');
    assert.equal(captured.customer, 'cus_m1');
    assert.equal(captured.priceId, 'price_shop_test');
    assert.equal(captured.metadata.aSearchProduct, 'merchant_shop');
    assert.equal(captured.metadata.shopId, shop.shopId);
    assert.equal(captured.trial_period_days, undefined);
    assert.equal(shops.get(shop.shopId).stripeCustomerId, 'cus_m1');
  });

  it('cancelShopSubscription calls cancel_at_period_end', async () => {
    const shops = createShopsRegistry();
    const shop = seedPendingShop(shops);
    shops.transition(shop.shopId, 'live', { at: new Date().toISOString() });
    shops.setSubscriptionStatus(shop.shopId, 'active', {
      stripeSubscriptionId: 'sub_abc',
    });
    let captured;
    const result = await cancelShopSubscription({
      shops,
      shopId: shop.shopId,
      merchantUserId: 'm1',
      cancelStripeSubscription: async (opts) => {
        captured = opts;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(captured.subscriptionId, 'sub_abc');
    assert.equal(captured.cancel_at_period_end, true);
  });

  it('webhook active -> live; duplicate event is no-op', async () => {
    const shops = createShopsRegistry();
    const events = createStripeEventStore();
    const invoices = createShopInvoicesStore();
    const feedKeys = createPartFeedKeysStore();
    const queue = createShopSyncQueue();
    const parts = createPartsStore();
    const shop = seedPendingShop(shops);
    const evt = stripeEvent(
      'customer.subscription.updated',
      {
        id: 'sub_1',
        status: 'active',
        metadata: {
          shopId: shop.shopId,
          merchantUserId: 'm1',
          aSearchProduct: 'merchant_shop',
        },
      },
      'evt_active_1',
    );
    const r1 = await applyMerchantShopStripeEvent({
      event: evt,
      shops,
      events,
      invoices,
      feedKeys,
      queue,
      parts,
    });
    assert.equal(r1.action, 'live');
    assert.equal(shops.get(shop.shopId).status, 'live');
    assert.equal(shops.get(shop.shopId).subscriptionStatus, 'active');
    assert.equal(shops.get(shop.shopId).stripeSubscriptionId, 'sub_1');

    const r2 = await applyMerchantShopStripeEvent({
      event: evt,
      shops,
      events,
      invoices,
      feedKeys,
      queue,
      parts,
    });
    assert.equal(r2.duplicate, true);
    assert.equal(events.size(), 1);
  });

  it('past_due stays live; unpaid suspends payment; deleted cancels', async () => {
    const shops = createShopsRegistry();
    const events = createStripeEventStore();
    const shop = seedPendingShop(shops);
    await applyMerchantShopStripeEvent({
      event: stripeEvent('customer.subscription.updated', {
        id: 'sub_2',
        status: 'active',
        metadata: {
          shopId: shop.shopId,
          aSearchProduct: 'merchant_shop',
        },
      }),
      shops,
      events,
    });
    assert.equal(shops.get(shop.shopId).status, 'live');

    await applyMerchantShopStripeEvent({
      event: stripeEvent('customer.subscription.updated', {
        id: 'sub_2',
        status: 'past_due',
        metadata: {
          shopId: shop.shopId,
          aSearchProduct: 'merchant_shop',
        },
      }),
      shops,
      events,
    });
    assert.equal(shops.get(shop.shopId).status, 'live');
    assert.equal(shops.get(shop.shopId).subscriptionStatus, 'past_due');

    await applyMerchantShopStripeEvent({
      event: stripeEvent('customer.subscription.updated', {
        id: 'sub_2',
        status: 'unpaid',
        metadata: {
          shopId: shop.shopId,
          aSearchProduct: 'merchant_shop',
        },
      }),
      shops,
      events,
    });
    assert.equal(shops.get(shop.shopId).status, 'suspended');
    assert.equal(shops.get(shop.shopId).suspendReason, 'payment');

    await applyMerchantShopStripeEvent({
      event: stripeEvent('customer.subscription.deleted', {
        id: 'sub_2',
        status: 'canceled',
        metadata: {
          shopId: shop.shopId,
          aSearchProduct: 'merchant_shop',
        },
      }),
      shops,
      events,
    });
    assert.equal(shops.get(shop.shopId).status, 'cancelled');
  });

  it('two shops: unpaid on A does not suspend B', async () => {
    const shops = createShopsRegistry();
    const events = createStripeEventStore();
    const a = seedPendingShop(shops, { providerShopId: 'a1' });
    const b = seedPendingShop(shops, { providerShopId: 'b1' });
    for (const s of [a, b]) {
      await applyMerchantShopStripeEvent({
        event: stripeEvent('customer.subscription.updated', {
          id: 'sub_' + s.shopId,
          status: 'active',
          metadata: {
            shopId: s.shopId,
            aSearchProduct: 'merchant_shop',
          },
        }),
        shops,
        events,
      });
    }
    await applyMerchantShopStripeEvent({
      event: stripeEvent('customer.subscription.updated', {
        id: 'sub_' + a.shopId,
        status: 'unpaid',
        metadata: {
          shopId: a.shopId,
          aSearchProduct: 'merchant_shop',
        },
      }),
      shops,
      events,
    });
    assert.equal(shops.get(a.shopId).status, 'suspended');
    assert.equal(shops.get(b.shopId).status, 'live');
  });

  it('widget_upgrade webhook never touches Shops', async () => {
    const shops = createShopsRegistry();
    const events = createStripeEventStore();
    const shop = seedPendingShop(shops);
    const r = await applyMerchantShopStripeEvent({
      event: stripeEvent('customer.subscription.updated', {
        id: 'sub_w',
        status: 'active',
        metadata: {
          shopId: shop.shopId,
          aSearchProduct: 'widget_upgrade',
        },
      }),
      shops,
      events,
    });
    assert.equal(r.ignored, true);
    assert.equal(r.reason, 'widget_upgrade');
    assert.equal(shops.get(shop.shopId).status, 'pending_payment');
  });

  it('invoice events upsert ShopInvoices mirror', async () => {
    const shops = createShopsRegistry();
    const events = createStripeEventStore();
    const invoices = createShopInvoicesStore();
    const shop = seedPendingShop(shops);
    const now = Math.floor(Date.now() / 1000);
    await applyMerchantShopStripeEvent({
      event: stripeEvent('invoice.paid', {
        id: 'in_1',
        status: 'paid',
        period_start: now - 86400 * 30,
        period_end: now,
        subscription: 'sub_1',
        metadata: { shopId: shop.shopId, aSearchProduct: 'merchant_shop' },
      }),
      shops,
      events,
      invoices,
    });
    const row = invoices.get('in_1');
    assert.ok(row);
    assert.equal(row.shopId, shop.shopId);
    assert.equal(row.status, 'paid');
    assert.equal(row.subscriptionId, 'sub_1');
  });

  it('HTTP subscribe/cancel routes + handler JWT gate', async () => {
    assert.equal(
      matchMerchantShopsRoute('POST', '/merchant/shops/shp_x/subscribe'),
      'POST /merchant/shops/{shopId}/subscribe',
    );
    assert.equal(
      matchMerchantShopsRoute('POST', '/merchant/shops/shp_x/cancel'),
      'POST /merchant/shops/{shopId}/cancel',
    );
    assert.equal(
      matchStripeWebhookRoute('POST', '/webhooks/stripe'),
      'POST /webhooks/stripe',
    );

    const shops = createShopsRegistry();
    const shop = seedPendingShop(shops);
    const unauth = await handleMerchantShopsSubscribe(
      {
        requestContext: { http: { method: 'POST', path: `/merchant/shops/${shop.shopId}/subscribe` } },
        rawPath: `/merchant/shops/${shop.shopId}/subscribe`,
        headers: {},
      },
      { shops },
    );
    assert.equal(unauth.statusCode, 401);

    const ok = await handleMerchantShopsSubscribe(
      {
        requestContext: { http: { method: 'POST', path: `/merchant/shops/${shop.shopId}/subscribe` } },
        rawPath: `/merchant/shops/${shop.shopId}/subscribe`,
        headers: { authorization: 'Bearer t' },
      },
      {
        shops,
        verifyAuthorization: async () => ({ userId: 'm1' }),
        createCheckoutSession: async () => ({
          id: 'cs_1',
          url: 'https://checkout.stripe.com/c/pay/ok',
        }),
        ensureStripeCustomer: async () => 'cus_1',
      },
    );
    assert.equal(ok.statusCode, 200);
    const body = JSON.parse(ok.body);
    assert.equal(body.ok, true);
    assert.match(body.checkoutUrl, /checkout\.stripe\.com/);

    const cancel = await handleMerchantShopsCancel(
      {
        requestContext: { http: { method: 'POST', path: `/merchant/shops/${shop.shopId}/cancel` } },
        rawPath: `/merchant/shops/${shop.shopId}/cancel`,
        headers: { authorization: 'Bearer t' },
      },
      {
        shops,
        verifyAuthorization: async () => ({ userId: 'm1' }),
      },
    );
    assert.equal(cancel.statusCode, 200);
  });

  it('entry handler dispatches stripe webhook before FR-208 501 stub', async () => {
    const shops = createShopsRegistry();
    const shop = seedPendingShop(shops);
    const events = createStripeEventStore();
    const payload = stripeEvent('customer.subscription.updated', {
      id: 'sub_h',
      status: 'active',
      metadata: {
        shopId: shop.shopId,
        aSearchProduct: 'merchant_shop',
      },
    });
    const res = await handler(
      {
        requestContext: { http: { method: 'POST', path: '/webhooks/stripe' } },
        rawPath: '/webhooks/stripe',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      },
      {},
      { shops, stripeEvents: events },
    );
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, true);
    assert.equal(shops.get(shop.shopId).status, 'live');
  });

  it('verifyStripeSignature rejects bad HMAC; accepts valid', () => {
    const secret = 'whsec_test';
    const raw = '{"id":"evt_x"}';
    const ts = Math.floor(Date.now() / 1000);
    const v1 = crypto
      .createHmac('sha256', secret)
      .update(`${ts}.${raw}`)
      .digest('hex');
    assert.equal(
      verifyStripeSignature(raw, `t=${ts},v1=${v1}`, secret, Date.now()),
      true,
    );
    assert.equal(
      verifyStripeSignature(raw, `t=${ts},v1=deadbeef`, secret, Date.now()),
      false,
    );
  });

  it('handleStripeWebhook returns 400 on invalid signature when secret set', async () => {
    const res = await handleStripeWebhook(
      {
        headers: { 'stripe-signature': 't=1,v1=bad' },
        body: '{}',
      },
      { stripeWebhookSecret: 'whsec_x', nowMs: Date.now() },
    );
    assert.equal(res.statusCode, 400);
  });
});
