'use strict';

/**
 * FR-235 / #1349: Merchant Shops registry, status machine, vault pointer, GET/DELETE.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const {
  createShopsRegistry,
  MERCHANT_SHOP_PROVIDERS,
  ShopConflictError,
  ShopTransitionError,
} = require('../shared/shops/registry');
const { transitionShop, ALLOWED_TRANSITIONS } = require('../shared/shops/status');
const { createMemoryVault } = require('../shared/shops/vault');
const { redactShopSecrets } = require('../shared/shops/redactLog');
const {
  matchMerchantShopsRoute,
  handleMerchantShops,
} = require('../entry/src/merchantShops');

describe('FR-235 merchant shops registry', () => {
  /** @type {ReturnType<typeof createShopsRegistry>} */
  let shops;
  /** @type {ReturnType<typeof createMemoryVault>} */
  let vault;

  beforeEach(() => {
    shops = createShopsRegistry();
    vault = createMemoryVault();
  });

  it('one merchant three shops -> list of 3', () => {
    for (let i = 0; i < 3; i++) {
      shops.upsertConnect({
        merchantUserId: 'ABCD1234',
        env: 'sandbox',
        provider: 'shopify',
        providerShopId: 'gid://shop/' + i,
        shopDomain: 'shop' + i + '.myshopify.com',
        displayName: 'Shop ' + i,
        credentialsSecretRef: 'arn:aws:secretsmanager:eu-west-2:1:secret:a-search/sandbox/shops/x' + i,
      });
    }
    const list = shops.listPublic('ABCD1234', 'sandbox');
    assert.equal(list.length, 3);
    for (const row of list) {
      assert.ok(row.shopId.startsWith('shp_'));
      assert.equal(row.status, 'pending_payment');
      assert.equal(row.credentialsSecretRef, undefined);
      assert.ok(!('credentials' in row));
    }
  });

  it('same merchant reconnect same provider shop -> one row, credentials refreshed', async () => {
    const first = shops.upsertConnect({
      merchantUserId: 'ABCD1234',
      env: 'live',
      provider: 'wix',
      providerShopId: 'site-1',
      shopDomain: 'example.wixsite.com',
      credentialsSecretRef: 'vault:old',
    });
    const ref = await vault.put({
      env: 'live',
      shopId: first.shopId,
      credentials: { apiToken: 'SECRET_TOKEN_VALUE_1' },
    });
    shops.setCredentialRef(first.shopId, ref);

    const second = shops.upsertConnect({
      merchantUserId: 'ABCD1234',
      env: 'live',
      provider: 'wix',
      providerShopId: 'site-1',
      shopDomain: 'example.wixsite.com',
      displayName: 'Renamed',
      credentialsSecretRef: 'vault:new',
    });
    assert.equal(second.shopId, first.shopId);
    assert.equal(shops.listPublic('ABCD1234', 'live').length, 1);
    assert.equal(shops.get(first.shopId).credentialsSecretRef, 'vault:new');
    assert.equal(shops.get(first.shopId).displayName, 'Renamed');
  });

  it('another merchant connecting same provider shop -> 409 shop_already_connected', () => {
    shops.upsertConnect({
      merchantUserId: 'AAAA1111',
      env: 'sandbox',
      provider: 'woocommerce',
      providerShopId: 'https://woo.example',
      shopDomain: 'woo.example',
      credentialsSecretRef: 'vault:a',
    });
    assert.throws(
      () =>
        shops.upsertConnect({
          merchantUserId: 'BBBB2222',
          env: 'sandbox',
          provider: 'woocommerce',
          providerShopId: 'https://woo.example',
          shopDomain: 'woo.example',
          credentialsSecretRef: 'vault:b',
        }),
      (err) =>
        err instanceof ShopConflictError &&
        err.code === 'shop_already_connected' &&
        err.statusCode === 409,
    );
  });

  it('illegal transitions throw; legal pending_payment -> live writes status log', () => {
    const row = shops.upsertConnect({
      merchantUserId: 'ABCD1234',
      env: 'sandbox',
      provider: 'shopify',
      providerShopId: 'g1',
      shopDomain: 'a.myshopify.com',
    });
    assert.throws(
      () => transitionShop(shops, row.shopId, 'suspended', { reason: 'payment' }),
      (err) => err instanceof ShopTransitionError,
    );
    assert.throws(
      () => {
        shops.transition(row.shopId, 'cancelled', { reason: 'admin' });
        transitionShop(shops, row.shopId, 'live', {});
      },
      (err) => err instanceof ShopTransitionError,
    );

    const row2 = shops.upsertConnect({
      merchantUserId: 'ABCD1234',
      env: 'sandbox',
      provider: 'shopify',
      providerShopId: 'g2',
      shopDomain: 'b.myshopify.com',
    });
    const next = transitionShop(shops, row2.shopId, 'live', {
      reason: null,
      at: '2026-10-15T00:00:00.000Z',
    });
    assert.equal(next.status, 'live');
    assert.ok(next.liveAt);
    const log = shops.statusLog(row2.shopId);
    assert.equal(log.length, 1);
    assert.equal(log[0].fromStatus, 'pending_payment');
    assert.equal(log[0].toStatus, 'live');
    assert.ok(ALLOWED_TRANSITIONS.pending_payment.includes('live'));
  });

  it('vault never returns secrets via public list; redactLog strips token/secret/key/password', async () => {
    const row = shops.upsertConnect({
      merchantUserId: 'ABCD1234',
      env: 'sandbox',
      provider: 'shopify',
      providerShopId: 'g3',
      shopDomain: 'c.myshopify.com',
    });
    const ref = await vault.put({
      env: 'sandbox',
      shopId: row.shopId,
      credentials: {
        access_token: 'shpat_LIVE_SECRET',
        client_secret: 'cs_SECRET',
        api_key: 'key_SECRET',
        password: 'pw_SECRET',
      },
    });
    shops.setCredentialRef(row.shopId, ref);
    const pub = shops.listPublic('ABCD1234', 'sandbox');
    const blob = JSON.stringify(pub);
    assert.doesNotMatch(blob, /shpat_LIVE_SECRET|cs_SECRET|key_SECRET|pw_SECRET/);
    assert.doesNotMatch(blob, /access_token|client_secret/);

    const line = redactShopSecrets(
      'token=shpat_LIVE_SECRET secret=x api_key=y password=z shopId=' + row.shopId,
    );
    assert.doesNotMatch(line, /shpat_LIVE_SECRET/);
    assert.match(line, /token=\[REDACTED\]/);
    assert.match(line, /password=\[REDACTED\]/);
  });

  it('GET /merchant/shops and DELETE /merchant/shops/{shopId} HTTP contracts', async () => {
    shops.upsertConnect({
      merchantUserId: 'MERCH001',
      env: 'sandbox',
      provider: 'shopify',
      providerShopId: 'gx',
      shopDomain: 'x.myshopify.com',
      displayName: 'X',
    });
    const listRoute = matchMerchantShopsRoute('GET', '/merchant/shops');
    assert.equal(listRoute, 'GET /merchant/shops');
    const listRes = await handleMerchantShops(
      {
        requestContext: { http: { method: 'GET', path: '/merchant/shops' } },
        headers: { authorization: 'Bearer test' },
      },
      listRoute,
      {
        verifyAuthorization: async () => ({
          userId: 'MERCH001',
          role: 'merchant',
        }),
        shops,
        env: 'sandbox',
      },
    );
    assert.equal(listRes.statusCode, 200);
    const body = JSON.parse(listRes.body);
    assert.equal(body.shops.length, 1);
    assert.equal(body.shops[0].displayName, 'X');
    assert.ok(!JSON.stringify(body).includes('credentialsSecretRef'));

    const shopId = body.shops[0].shopId;
    const delRoute = matchMerchantShopsRoute(
      'DELETE',
      '/merchant/shops/' + shopId,
    );
    assert.equal(delRoute, 'DELETE /merchant/shops/{shopId}');
    const delRes = await handleMerchantShops(
      {
        requestContext: {
          http: { method: 'DELETE', path: '/merchant/shops/' + shopId },
        },
        headers: { authorization: 'Bearer test' },
      },
      delRoute,
      {
        verifyAuthorization: async () => ({
          userId: 'MERCH001',
          role: 'merchant',
        }),
        shops,
        env: 'sandbox',
        cancelSubscription: async () => ({ ok: true, atPeriodEnd: true }),
      },
    );
    assert.equal(delRes.statusCode, 200);
    assert.equal(shops.get(shopId).status, 'cancelled');
    assert.equal(shops.get(shopId).suspendReason, 'admin');
  });

  it('Decision LOCKED; migration ShopStatusLog; provider enum; CDK GET+DELETE', () => {
    const fr = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-235.md'), 'utf8');
    assert.match(fr, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(fr, /shop_already_connected/);
    assert.match(fr, /ShopStatusLog/);

    const mig = fs.readFileSync(
      path.join(ROOT, 'db', 'migrations', '011_ShopStatusLog.sql'),
      'utf8',
    );
    assert.match(mig, /ShopStatusLog/);
    assert.match(mig, /UQ_Shops_EnvProviderShop/);
    assert.match(mig, /FR-251/);
    assert.doesNotMatch(mig, /USE\s+madeiradb/i);

    assert.ok(MERCHANT_SHOP_PROVIDERS.includes('shopify'));
    assert.ok(MERCHANT_SHOP_PROVIDERS.includes('ecwid'));
    assert.ok(!MERCHANT_SHOP_PROVIDERS.includes('prestashop'));

    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /path:\s*'\/merchant\/shops'/);
    assert.match(stack, /path:\s*'\/merchant\/shops\/\{shopId\}'/);

    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'shared', 'package.json'), 'utf8'),
    );
    assert.ok(pkg.files.includes('shops/'));
  });
});