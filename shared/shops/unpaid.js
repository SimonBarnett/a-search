'use strict';

/**
 * FR-241: unpaid shops never download; hard-delete shop data after 2 unpaid periods.
 * Per-shop scope. Merchant login retained. Notices N1-N3 (SMS stub + email).
 */

const { isShopPaid } = require('./shopSync');

const N2_MIN_LEAD_MS = 7 * 86400000;

/**
 * @param {object} shop
 * @param {{ nowMs?: number, maxCacheMs?: number }} [opts]
 * Cache older than 48h should refresh from Stripe before decide (inject refresh).
 */
function needsSubscriptionRefresh(shop, opts) {
  const maxMs = (opts && opts.maxCacheMs) || 48 * 3600000;
  const now = opts && opts.nowMs != null ? Number(opts.nowMs) : Date.now();
  if (!shop || !shop.subscriptionStatusAt) return true;
  const at = Date.parse(shop.subscriptionStatusAt);
  if (!Number.isFinite(at)) return true;
  return now - at > maxMs;
}

/**
 * Record a paid invoice: reset consecutive unpaid counter.
 */
function recordInvoicePaid(shops, shopId) {
  return shops.setConsecutiveUnpaidPeriods(shopId, 0);
}

/**
 * Record one unpaid billing period. Sends N1 on first. Returns updated shop.
 */
async function recordUnpaidPeriod(args) {
  const shops = args.shops;
  const shopId = args.shopId;
  const sendNotice = args.sendNotice || (async () => {});
  const now = args.now instanceof Date ? args.now : new Date(args.nowMs || Date.now());
  const shop = shops.get(shopId);
  if (!shop) {
    const err = new Error('shop_not_found');
    err.code = 'shop_not_found';
    throw err;
  }
  const next = (Number(shop.consecutiveUnpaidPeriods) || 0) + 1;
  shops.setConsecutiveUnpaidPeriods(shopId, next);
  if (next === 1 && !(shop.notices && shop.notices.N1)) {
    await sendNotice({
      channel: 'sms',
      notice: 'N1',
      shopId,
      shopDomain: shop.shopDomain,
      body: 'payment failed; downloads paused',
    });
    shops.markNoticeSent(shopId, 'N1', now.toISOString());
  }
  return shops.get(shopId);
}

/**
 * Schedule / send N2 at least 7 days before projected second period_end.
 */
async function maybeSendN2(args) {
  const shops = args.shops;
  const shop = shops.get(args.shopId);
  if (!shop) return { sent: false, reason: 'shop_not_found' };
  if ((Number(shop.consecutiveUnpaidPeriods) || 0) < 1) {
    return { sent: false, reason: 'counter_lt_1' };
  }
  if (shop.notices && shop.notices.N2) return { sent: false, reason: 'already_sent' };
  const now = args.now instanceof Date ? args.now : new Date();
  const periodEnd = args.periodEnd instanceof Date ? args.periodEnd : new Date(args.periodEnd);
  const lead = periodEnd.getTime() - now.getTime();
  // Send when within lead window or when forced for tests
  if (!args.force && lead > N2_MIN_LEAD_MS) {
    return { sent: false, reason: 'too_early' };
  }
  const sendNotice = args.sendNotice || (async () => {});
  const dateStr = periodEnd.toISOString().slice(0, 10);
  await sendNotice({
    channel: 'sms',
    notice: 'N2',
    shopId: shop.shopId,
    shopDomain: shop.shopDomain,
    body: `shop data for ${shop.shopDomain} will be deleted on ${dateStr} unless payment is made; you can log in at any time to re-subscribe`,
  });
  shops.markNoticeSent(shop.shopId, 'N2', now.toISOString());
  return { sent: true };
}

/**
 * Hard-delete one shop's a-search data after 2 unpaid periods (Simon 14:11).
 * Merchant login retained. Other shops untouched.
 */
async function hardDeleteShopForNonPayment(args) {
  const shops = args.shops;
  const feedKeys = args.feedKeys;
  const parts = args.parts;
  const vault = args.vault;
  const sendNotice = args.sendNotice || (async () => {});
  const revokeProvider = args.revokeProvider || (async () => ({ revoked: true }));
  const cancelStripeSub = args.cancelStripeSub || (async () => ({ canceled: true }));
  const markInvoicesUncollectible =
    args.markInvoicesUncollectible || (async () => ({ marked: true }));
  const now = args.now instanceof Date ? args.now : new Date();
  const shop = shops.get(args.shopId);
  if (!shop) {
    const err = new Error('shop_not_found');
    err.code = 'shop_not_found';
    throw err;
  }
  if ((Number(shop.consecutiveUnpaidPeriods) || 0) < 2) {
    return { deleted: false, reason: 'counter_lt_2' };
  }
  // N2 must have been sent at least 7 days earlier
  const n2At = shop.notices && shop.notices.N2;
  if (!n2At) {
    return { deleted: false, reason: 'n2_missing' };
  }
  const n2Ms = Date.parse(n2At);
  if (!args.forceN2Age && now.getTime() - n2Ms < N2_MIN_LEAD_MS) {
    return { deleted: false, reason: 'n2_too_recent', postponeUntil: new Date(n2Ms + N2_MIN_LEAD_MS).toISOString() };
  }

  // Idempotent: already cancelled+removed
  if (shop.status === 'cancelled' && shop.suspendReason === 'removed') {
    return { deleted: false, reason: 'already_removed' };
  }

  await cancelStripeSub({
    shopId: shop.shopId,
    stripeSubscriptionId: shop.stripeSubscriptionId,
    proration: false,
  });
  await markInvoicesUncollectible({ shopId: shop.shopId });
  await revokeProvider({ shop, provider: shop.provider });

  if (shop.credentialsSecretRef && vault && typeof vault.delete === 'function') {
    await Promise.resolve(vault.delete(shop.credentialsSecretRef));
  }
  shops.setCredentialRef(shop.shopId, null);

  parts.hardDeleteFeed(shop.provider, shop.shopId, shop.env);
  feedKeys.deleteKey(shop.provider, shop.shopId, shop.env);

  shops.transition(shop.shopId, 'cancelled', {
    reason: 'removed',
    nowMs: now.getTime(),
  });

  await sendNotice({
    channel: 'sms',
    notice: 'N3',
    shopId: shop.shopId,
    shopDomain: shop.shopDomain,
    body: `shop data for ${shop.shopDomain} has been deleted; log in to re-subscribe and reconnect`,
  });
  shops.markNoticeSent(shop.shopId, 'N3', now.toISOString());

  return {
    deleted: true,
    shopId: shop.shopId,
    merchantUserId: shop.merchantUserId,
  };
}

/**
 * Daily dunning tick: process unpaid counters / notices / hard-delete.
 * @param {{
 *   shops: object,
 *   feedKeys: object,
 *   parts: object,
 *   vault: object,
 *   listShopIds?: () => string[],
 *   sendNotice?: Function,
 *   now?: Date,
 *   periodEndByShop?: Record<string, Date|string>,
 * }} args
 */
async function runMerchantDunning(args) {
  const shops = args.shops;
  const ids =
    typeof args.listShopIds === 'function'
      ? args.listShopIds()
      : (args.shopIds || []);
  const results = [];
  for (const shopId of ids) {
    const shop = shops.get(shopId);
    if (!shop) continue;
    if (isShopPaid(shop)) {
      if ((Number(shop.consecutiveUnpaidPeriods) || 0) > 0) {
        recordInvoicePaid(shops, shopId);
      }
      continue;
    }
    // Unpaid: ensure N2 when approaching / force path for tests
    if (args.periodEndByShop && args.periodEndByShop[shopId]) {
      await maybeSendN2({
        shops,
        shopId,
        periodEnd: args.periodEndByShop[shopId],
        sendNotice: args.sendNotice,
        now: args.now,
        force: args.forceN2,
      });
    }
    if ((Number(shops.get(shopId).consecutiveUnpaidPeriods) || 0) >= 2) {
      const del = await hardDeleteShopForNonPayment({
        shops,
        feedKeys: args.feedKeys,
        parts: args.parts,
        vault: args.vault,
        shopId,
        sendNotice: args.sendNotice,
        revokeProvider: args.revokeProvider,
        cancelStripeSub: args.cancelStripeSub,
        markInvoicesUncollectible: args.markInvoicesUncollectible,
        now: args.now,
        forceN2Age: args.forceN2Age,
      });
      results.push(del);
    }
  }
  return { ok: true, results };
}

module.exports = {
  N2_MIN_LEAD_MS,
  isShopPaid,
  needsSubscriptionRefresh,
  recordInvoicePaid,
  recordUnpaidPeriod,
  maybeSendN2,
  hardDeleteShopForNonPayment,
  runMerchantDunning,
};
