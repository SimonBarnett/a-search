'use strict';

/**
 * FR-239: per-shop GBP 20 Stripe subscription (Checkout + webhook transitions).
 * One Stripe Customer per merchant; one Subscription per shop.
 * aSearchProduct=merchant_shop (never partner_monthly; distinct from widget_upgrade).
 */

const { onShopLive, onShopStopServing } = require('./shopSync');

const ASE_PRODUCT_SHOP = 'merchant_shop';
const ASE_PRODUCT_WIDGET = 'widget_upgrade';

/**
 * @param {object} shop
 * @returns {boolean}
 */
function canStartSubscribe(shop) {
  if (!shop) return false;
  const st = String(shop.status || '');
  if (st === 'pending_payment') return true;
  if (st === 'suspended' && String(shop.suspendReason || '') === 'payment') {
    return true;
  }
  return false;
}

/**
 * @param {{
 *   shops: object,
 *   shopId: string,
 *   merchantUserId: string,
 *   env?: string,
 *   priceId?: string,
 *   successUrl?: string,
 *   cancelUrl?: string,
 *   createCheckoutSession?: Function,
 *   ensureStripeCustomer?: Function,
 *   nowMs?: number,
 * }} args
 */
async function startShopSubscribe(args) {
  const shops = args.shops;
  const shop = shops.get(args.shopId);
  if (!shop) {
    const err = new Error('shop_not_found');
    err.code = 'shop_not_found';
    throw err;
  }
  if (String(shop.merchantUserId) !== String(args.merchantUserId)) {
    const err = new Error('forbidden');
    err.code = 'forbidden';
    throw err;
  }
  if (!canStartSubscribe(shop)) {
    const err = new Error('shop_not_subscribable');
    err.code = 'shop_not_subscribable';
    throw err;
  }

  const priceId = String(
    args.priceId ||
      (args.env && args.env.SHOP_MONTHLY_PRICE_ID) ||
      process.env.SHOP_MONTHLY_PRICE_ID ||
      'price_shop_monthly_stub',
  );

  let customerId = shop.stripeCustomerId || null;
  if (!customerId && typeof args.ensureStripeCustomer === 'function') {
    customerId = await args.ensureStripeCustomer({
      merchantUserId: args.merchantUserId,
      shopId: shop.shopId,
    });
  }
  if (!customerId) {
    customerId = `cus_stub_${String(args.merchantUserId)}`;
  }
  // Persist one Stripe Customer per merchant (reuse across shops).
  if (
    customerId &&
    customerId !== shop.stripeCustomerId &&
    typeof shops.setStripeCustomerId === 'function'
  ) {
    shops.setStripeCustomerId(shop.shopId, customerId);
    // Mirror onto sibling shops for the same merchant (in-memory registry).
    if (typeof shops.listByMerchant === 'function') {
      for (const sib of shops.listByMerchant(args.merchantUserId, shop.env)) {
        if (
          sib.shopId !== shop.shopId &&
          !sib.stripeCustomerId &&
          typeof shops.setStripeCustomerId === 'function'
        ) {
          shops.setStripeCustomerId(sib.shopId, customerId);
        }
      }
    }
  }

  const metadata = {
    shopId: shop.shopId,
    merchantUserId: String(args.merchantUserId),
    env: String(shop.env || 'live'),
    aSearchProduct: ASE_PRODUCT_SHOP,
  };

  const create =
    typeof args.createCheckoutSession === 'function'
      ? args.createCheckoutSession
      : async (opts) => ({
          id: 'cs_stub_' + opts.metadata.shopId,
          url:
            'https://checkout.stripe.com/c/pay/stub_shop' +
            '?shopId=' +
            encodeURIComponent(opts.metadata.shopId),
        });

  const session = await create({
    mode: 'subscription',
    customer: customerId,
    priceId,
    successUrl:
      args.successUrl ||
      'https://smartcatalogue.uk/wizard/subscribe/success',
    cancelUrl:
      args.cancelUrl || 'https://smartcatalogue.uk/wizard/subscribe/cancel',
    metadata,
    subscription_data: { metadata },
    // No trial for merchant_shop (Simon 14:11).
    trial_period_days: undefined,
  });

  if (!session || !session.url) {
    const err = new Error('checkout_session_failed');
    err.code = 'checkout_session_failed';
    throw err;
  }

  return {
    checkoutUrl: String(session.url),
    sessionId: session.id ? String(session.id) : null,
    shopId: shop.shopId,
  };
}

/**
 * @param {{
 *   shops: object,
 *   shopId: string,
 *   merchantUserId: string,
 *   cancelStripeSubscription?: Function,
 *   atPeriodEnd?: boolean,
 * }} args
 */
async function cancelShopSubscription(args) {
  const shops = args.shops;
  const shop = shops.get(args.shopId);
  if (!shop) {
    const err = new Error('shop_not_found');
    err.code = 'shop_not_found';
    throw err;
  }
  if (String(shop.merchantUserId) !== String(args.merchantUserId)) {
    const err = new Error('forbidden');
    err.code = 'forbidden';
    throw err;
  }
  const atPeriodEnd = args.atPeriodEnd !== false;
  if (
    shop.stripeSubscriptionId &&
    typeof args.cancelStripeSubscription === 'function'
  ) {
    await args.cancelStripeSubscription({
      subscriptionId: shop.stripeSubscriptionId,
      cancel_at_period_end: atPeriodEnd,
    });
  }
  return {
    ok: true,
    shopId: shop.shopId,
    atPeriodEnd,
    stripeSubscriptionId: shop.stripeSubscriptionId || null,
  };
}

/**
 * Map Stripe subscription status to shop transition + subscriptionStatus.
 * @param {string} stripeStatus
 */
function mapSubscriptionStatus(stripeStatus) {
  const s = String(stripeStatus || '').toLowerCase();
  if (s === 'active') {
    return { subscriptionStatus: 'active', shopAction: 'live' };
  }
  if (s === 'trialing') {
    // Simon: no free trial; if seen treat as not paid for download; still may be live row.
    return { subscriptionStatus: 'trialing', shopAction: 'live' };
  }
  if (s === 'past_due') {
    return { subscriptionStatus: 'past_due', shopAction: 'stay_live' };
  }
  if (
    s === 'unpaid' ||
    s === 'incomplete_expired' ||
    s === 'paused' ||
    s === 'incomplete'
  ) {
    return { subscriptionStatus: s, shopAction: 'suspended_payment' };
  }
  if (s === 'canceled' || s === 'cancelled') {
    return { subscriptionStatus: 'canceled', shopAction: 'cancelled' };
  }
  return { subscriptionStatus: s || null, shopAction: 'none' };
}

/**
 * Apply a merchant_shop Stripe event to shops (+ optional FR-240 go-live).
 * @param {{
 *   event: object,
 *   shops: object,
 *   events?: { has: Function, record: Function },
 *   invoices?: { upsert: Function },
 *   feedKeys?: object,
 *   queue?: object,
 *   parts?: object,
 *   vault?: object,
 *   nowMs?: number,
 *   log?: Function,
 * }} args
 */
async function applyMerchantShopStripeEvent(args) {
  const event = args.event || {};
  const eventId = String(event.id || '');
  const eventType = String(event.type || '');
  const log = args.log || (() => {});

  if (args.events && eventId) {
    if (args.events.has(eventId)) {
      return { ok: true, duplicate: true, eventId };
    }
  }

  const obj = (event.data && event.data.object) || {};
  const meta = obj.metadata || {};
  const product = String(
    meta.aSearchProduct ||
      (obj.subscription_details &&
        obj.subscription_details.metadata &&
        obj.subscription_details.metadata.aSearchProduct) ||
      '',
  );

  // widget_upgrade never touches Shops
  if (product === ASE_PRODUCT_WIDGET) {
    if (args.events && eventId) {
      args.events.record({ id: eventId, type: eventType, nowMs: args.nowMs });
    }
    return { ok: true, ignored: true, reason: 'widget_upgrade', eventId };
  }

  // Invoice events may carry shopId on subscription metadata via parent
  if (eventType.startsWith('invoice.')) {
    const shopId =
      meta.shopId ||
      (obj.subscription_details &&
        obj.subscription_details.metadata &&
        obj.subscription_details.metadata.shopId) ||
      obj.metadata?.shopId;
    if (args.invoices && shopId && obj.id) {
      const periodStart =
        obj.period_start != null
          ? new Date(Number(obj.period_start) * 1000).toISOString()
          : null;
      const periodEnd =
        obj.period_end != null
          ? new Date(Number(obj.period_end) * 1000).toISOString()
          : null;
      args.invoices.upsert({
        shopId: String(shopId),
        invoiceId: String(obj.id),
        periodStart,
        periodEnd,
        status: String(obj.status || ''),
        subscriptionId: obj.subscription ? String(obj.subscription) : null,
        nowMs: args.nowMs,
      });
    }
    if (args.events && eventId) {
      args.events.record({ id: eventId, type: eventType, nowMs: args.nowMs });
    }
    return { ok: true, invoice: true, eventId };
  }

  if (product && product !== ASE_PRODUCT_SHOP) {
    if (args.events && eventId) {
      args.events.record({ id: eventId, type: eventType, nowMs: args.nowMs });
    }
    return { ok: true, ignored: true, reason: 'other_product', eventId };
  }

  const shopId = String(meta.shopId || '');
  if (!shopId) {
    if (args.events && eventId) {
      args.events.record({ id: eventId, type: eventType, nowMs: args.nowMs });
    }
    return { ok: true, ignored: true, reason: 'no_shopId', eventId };
  }

  const shop = args.shops.get(shopId);
  if (!shop) {
    if (args.events && eventId) {
      args.events.record({ id: eventId, type: eventType, nowMs: args.nowMs });
    }
    return { ok: true, ignored: true, reason: 'shop_not_found', eventId };
  }

  const nowMs = args.nowMs != null ? Number(args.nowMs) : Date.now();
  const at = new Date(nowMs).toISOString();

  if (
    eventType === 'customer.subscription.deleted' ||
    (eventType === 'customer.subscription.updated' &&
      String(obj.status || '') === 'canceled')
  ) {
    args.shops.setSubscriptionStatus(shopId, 'canceled', {
      at,
      stripeSubscriptionId: obj.id ? String(obj.id) : undefined,
      nowMs,
    });
    if (String(shop.status) !== 'cancelled') {
      try {
        args.shops.transition(shopId, 'cancelled', {
          reason: 'canceled',
          at,
          nowMs,
        });
      } catch {
        /* already terminal */
      }
    }
    if (args.events && eventId) {
      args.events.record({ id: eventId, type: eventType, nowMs });
    }
    return { ok: true, shopId, action: 'cancelled', eventId };
  }

  if (
    eventType === 'customer.subscription.updated' ||
    eventType === 'customer.subscription.created' ||
    eventType === 'checkout.session.completed'
  ) {
    // Prefer subscription object status; checkout.session may embed subscription
    let status = String(obj.status || '');
    let subId = obj.id && eventType.startsWith('customer.subscription')
      ? String(obj.id)
      : obj.subscription
        ? String(obj.subscription)
        : shop.stripeSubscriptionId;

    // For checkout.session.completed without expanded status, treat as active when paid
    if (eventType === 'checkout.session.completed' && !status) {
      status =
        String(obj.payment_status || '') === 'paid' ? 'active' : 'incomplete';
    }

    const mapped = mapSubscriptionStatus(status);
    args.shops.setSubscriptionStatus(shopId, mapped.subscriptionStatus, {
      at,
      stripeSubscriptionId: subId || undefined,
      nowMs,
    });

    const refreshed = args.shops.get(shopId);

    if (mapped.shopAction === 'live') {
      if (
        refreshed.status === 'pending_payment' ||
        (refreshed.status === 'suspended' &&
          refreshed.suspendReason === 'payment')
      ) {
        args.shops.transition(shopId, 'live', { reason: null, at, nowMs });
      }
      // FR-240 go-live import (no-op enqueue if unpaid/trialing)
      if (args.feedKeys && args.queue) {
        onShopLive({
          shop: args.shops.get(shopId),
          feedKeys: args.feedKeys,
          queue: args.queue,
          log,
          nowMs,
        });
      }
    } else if (mapped.shopAction === 'stay_live') {
      // past_due: keep live; downloads gated by isShopPaid
      if (refreshed.status !== 'live' && refreshed.status === 'pending_payment') {
        // should not happen; leave as-is
      }
    } else if (mapped.shopAction === 'suspended_payment') {
      if (refreshed.status === 'live' || refreshed.status === 'pending_payment') {
        try {
          args.shops.transition(shopId, 'suspended', {
            reason: 'payment',
            at,
            nowMs,
          });
        } catch {
          /* illegal */
        }
      } else if (refreshed.status === 'suspended') {
        args.shops.updateStatus(shopId, 'suspended', 'payment');
      }
      if (args.feedKeys && args.parts) {
        onShopStopServing({
          shop: args.shops.get(shopId),
          feedKeys: args.feedKeys,
          parts: args.parts,
          now: new Date(nowMs),
        });
      }
    } else if (mapped.shopAction === 'cancelled') {
      if (String(refreshed.status) !== 'cancelled') {
        try {
          args.shops.transition(shopId, 'cancelled', {
            reason: 'canceled',
            at,
            nowMs,
          });
        } catch {
          /* */
        }
      }
    }

    if (args.events && eventId) {
      args.events.record({ id: eventId, type: eventType, nowMs });
    }
    return {
      ok: true,
      shopId,
      action: mapped.shopAction,
      subscriptionStatus: mapped.subscriptionStatus,
      eventId,
    };
  }

  if (args.events && eventId) {
    args.events.record({ id: eventId, type: eventType, nowMs });
  }
  return { ok: true, ignored: true, reason: 'unhandled_type', eventType, eventId };
}

module.exports = {
  ASE_PRODUCT_SHOP,
  ASE_PRODUCT_WIDGET,
  canStartSubscribe,
  startShopSubscribe,
  cancelShopSubscription,
  mapSubscriptionStatus,
  applyMerchantShopStripeEvent,
};
