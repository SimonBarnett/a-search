'use strict';

/**
 * FR-241 / #1355: unpaid skip + dunning + per-shop hard-delete.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-241.md');

const { createShopsRegistry } = require('../shared/shops/registry');
const { createCredentialsVault } = require('../shared/shops/vault');
const {
  createPartFeedKeysStore,
  createPartsStore,
  createShopSyncQueue,
  onShopLive,
  rollShopRefresh,
  handleShopSyncMessage,
  isShopPaid,
} = require('../shared/shops/shopSync');
const {
  N2_MIN_LEAD_MS,
  needsSubscriptionRefresh,
  recordInvoicePaid,
  recordUnpaidPeriod,
  maybeSendN2,
  hardDeleteShopForNonPayment,
  runMerchantDunning,
} = require('../shared/shops/unpaid');

function seedLiveShop(shops, opts) {
  const row = shops.insert({
    merchantUserId: opts.merchantUserId || 'M1',
    env: opts.env || 'live',
    provider: opts.provider || 'shopify',
    providerShopId: opts.providerShopId || 'demo.myshopify.com',
    shopDomain: opts.shopDomain || 'demo.myshopify.com',
    credentialsSecretRef: opts.credentialsSecretRef || 'vault:shopify:demo',
    nowMs: opts.nowMs || 1_000,
  });
  shops.setSubscriptionStatus(row.shopId, opts.subscriptionStatus || 'active', {
    stripeSubscriptionId: opts.stripeSubscriptionId || 'sub_1',
    nowMs: opts.nowMs || 1_000,
  });
  return shops.transition(row.shopId, 'live', {
    nowMs: opts.liveAtMs || 2_000,
  });
}

describe('FR-241 merchant unpaid / dunning', () => {
  it('docs Decision LOCKED; ASCII no-BOM; hard-delete + per-shop + login retained', () => {
    const buf = fs.readFileSync(FR_DOC);
    assert.notEqual(buf[0], 0xef);
    for (const b of buf) assert.ok(b < 128, 'FR-241.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /hard-delete|hard delete/i);
    assert.match(text, /per shop|per-shop/i);
    assert.match(text, /login|merchant.*retained|login is kept/i);
    assert.match(text, /FR-251|a_search/);
    assert.match(text, /N2/);
  });

  it('past_due / unpaid never enqueued; consumer skips with no provider call', async () => {
    const shops = createShopsRegistry();
    const feedKeys = createPartFeedKeysStore();
    const parts = createPartsStore();
    const queue = createShopSyncQueue();
    const vault = createCredentialsVault();
    vault.put('vault:shopify:demo', { accessToken: 't' });
    const unpaid = seedLiveShop(shops, { subscriptionStatus: 'past_due' });
    const logs = [];
    const live = onShopLive({
      shop: unpaid,
      feedKeys,
      queue,
      now: new Date('2026-10-15T12:00:00Z'),
      log: (e) => logs.push(e),
    });
    assert.equal(live.enqueued, false);
    assert.equal(live.reason, 'unpaid');
    assert.ok(logs.some((l) => l.reason === 'unpaid'));

    // Force a message into the queue as if it became unpaid after enqueue
    shops.setSubscriptionStatus(unpaid.shopId, 'active', { nowMs: 3_000 });
    onShopLive({
      shop: shops.get(unpaid.shopId),
      feedKeys,
      queue,
      now: new Date('2026-10-15T12:00:00Z'),
    });
    shops.setSubscriptionStatus(unpaid.shopId, 'past_due', { nowMs: 4_000 });
    let catalogCalls = 0;
    const msg = queue.receive(unpaid.shopId);
    const r = await handleShopSyncMessage({
      message: msg,
      shops,
      feedKeys,
      parts,
      vault,
      queue,
      fetchCatalog: async () => {
        catalogCalls += 1;
        return [{ id: 'x', title: 'X' }];
      },
      now: new Date('2026-10-15T12:01:00Z'),
      log: (e) => logs.push(e),
    });
    assert.equal(r.skipped, true);
    assert.equal(r.reason, 'unpaid');
    assert.equal(catalogCalls, 0);
    assert.equal(shops.get(unpaid.shopId).lastSyncResult, 'skipped_unpaid');
  });

  it('roll skips unpaid shops', () => {
    const shops = createShopsRegistry();
    const feedKeys = createPartFeedKeysStore();
    const queue = createShopSyncQueue();
    const paid = seedLiveShop(shops, {
      providerShopId: 'a.myshopify.com',
      shopDomain: 'a.myshopify.com',
    });
    const bad = seedLiveShop(shops, {
      providerShopId: 'b.myshopify.com',
      shopDomain: 'b.myshopify.com',
      credentialsSecretRef: 'vault:shopify:b',
      subscriptionStatus: 'unpaid',
      nowMs: 3_000,
      liveAtMs: 4_000,
    });
    onShopLive({ shop: paid, feedKeys, queue, now: new Date('2026-02-01T00:00:00Z') });
    const drained = queue.receive(paid.shopId);
    if (drained) queue.deleteMessage(drained.id);
    for (const s of [paid, bad]) {
      feedKeys.upsertShopKey({
        provider: 'shopify',
        shopId: s.shopId,
        env: 'live',
        shopDomain: s.shopDomain,
        NextCheck: new Date('2026-01-01T00:00:00Z'),
        Active: 1,
      });
    }
    const logs = [];
    const roll = rollShopRefresh({
      feedKeys,
      shops,
      queue,
      now: new Date('2026-02-10T00:00:00Z'),
      env: 'live',
      log: (e) => logs.push(e),
    });
    assert.equal(roll.enqueued.length, 1);
    assert.equal(roll.enqueued[0].shopId, paid.shopId);
    assert.ok(logs.some((l) => l.reason === 'unpaid' && l.shopId === bad.shopId));
  });

  it('invoice paid resets counter; period 1 -> N1; period 2 + aged N2 -> hard-delete', async () => {
    const shops = createShopsRegistry();
    const feedKeys = createPartFeedKeysStore();
    const parts = createPartsStore();
    const vault = createCredentialsVault();
    const secretRef = 'a-search/live/shops/shp_demo';
    const shop = seedLiveShop(shops, {
      credentialsSecretRef: secretRef,
      providerShopId: 'del.myshopify.com',
      shopDomain: 'del.myshopify.com',
    });
    vault.put(secretRef, { accessToken: 'shpat_x' });
    feedKeys.upsertShopKey({
      provider: 'shopify',
      shopId: shop.shopId,
      env: 'live',
      shopDomain: shop.shopDomain,
      Active: 1,
    });
    parts.mergeStaging(
      [
        {
          Source: 'shopify',
          FeedKey: shop.shopId,
          Env: 'live',
          MerchantProductId: 'p1',
          Title: 'Hat',
          ProductUrl: 'https://del.myshopify.com/products/hat',
          ContentHash: 'h1',
        },
      ],
      'shopify',
      shop.shopId,
      'live',
    );
    assert.equal(parts.activeForFeed('shopify', shop.shopId, 'live').length, 1);

    const notices = [];
    const sendNotice = async (n) => {
      notices.push(n);
    };

    shops.setSubscriptionStatus(shop.shopId, 'past_due', { nowMs: 5_000 });
    await recordUnpaidPeriod({
      shops,
      shopId: shop.shopId,
      sendNotice,
      now: new Date('2026-03-01T00:00:00Z'),
    });
    assert.equal(shops.get(shop.shopId).consecutiveUnpaidPeriods, 1);
    assert.ok(notices.some((n) => n.notice === 'N1'));
    assert.ok(shops.get(shop.shopId).notices.N1);

    recordInvoicePaid(shops, shop.shopId);
    assert.equal(shops.get(shop.shopId).consecutiveUnpaidPeriods, 0);

    await recordUnpaidPeriod({
      shops,
      shopId: shop.shopId,
      sendNotice,
      now: new Date('2026-04-01T00:00:00Z'),
    });
    await recordUnpaidPeriod({
      shops,
      shopId: shop.shopId,
      sendNotice,
      now: new Date('2026-05-01T00:00:00Z'),
    });
    assert.equal(shops.get(shop.shopId).consecutiveUnpaidPeriods, 2);

    const n2 = await maybeSendN2({
      shops,
      shopId: shop.shopId,
      periodEnd: new Date('2026-05-08T00:00:00Z'),
      sendNotice,
      now: new Date('2026-05-01T00:00:00Z'),
      force: true,
    });
    assert.equal(n2.sent, true);
    assert.ok(notices.some((n) => n.notice === 'N2'));

    // Too soon after N2
    const early = await hardDeleteShopForNonPayment({
      shops,
      feedKeys,
      parts,
      vault,
      shopId: shop.shopId,
      sendNotice,
      now: new Date('2026-05-02T00:00:00Z'),
    });
    assert.equal(early.deleted, false);
    assert.equal(early.reason, 'n2_too_recent');

    const cancels = [];
    const revokes = [];
    const uncollect = [];
    const del = await hardDeleteShopForNonPayment({
      shops,
      feedKeys,
      parts,
      vault,
      shopId: shop.shopId,
      sendNotice,
      cancelStripeSub: async (a) => {
        cancels.push(a);
        return { canceled: true };
      },
      markInvoicesUncollectible: async (a) => {
        uncollect.push(a);
        return { marked: true };
      },
      revokeProvider: async (a) => {
        revokes.push(a);
        return { revoked: true };
      },
      now: new Date(Date.parse('2026-05-01T00:00:00Z') + N2_MIN_LEAD_MS + 1000),
    });
    assert.equal(del.deleted, true);
    assert.equal(cancels.length, 1);
    assert.equal(cancels[0].proration, false);
    assert.equal(revokes.length, 1);
    assert.equal(uncollect.length, 1);
    assert.equal(parts.activeForFeed('shopify', shop.shopId, 'live').length, 0);
    assert.equal(parts.all().length, 0);
    assert.equal(feedKeys.get('shopify', shop.shopId, 'live'), null);
    assert.equal(vault.get(secretRef), null);
    const gone = shops.get(shop.shopId);
    assert.equal(gone.status, 'cancelled');
    assert.equal(gone.suspendReason, 'removed');
    assert.equal(gone.credentialsSecretRef, null);
    assert.ok(notices.some((n) => n.notice === 'N3'));
    // Merchant id still on the row (login retained conceptually)
    assert.equal(gone.merchantUserId, 'M1');

    const again = await hardDeleteShopForNonPayment({
      shops,
      feedKeys,
      parts,
      vault,
      shopId: shop.shopId,
      sendNotice,
      now: new Date('2026-06-01T00:00:00Z'),
      forceN2Age: true,
    });
    assert.equal(again.deleted, false);
    assert.equal(again.reason, 'already_removed');
  });

  it('MERCHANT scope is per-shop: other paid shops keep syncing', async () => {
    const shops = createShopsRegistry();
    const feedKeys = createPartFeedKeysStore();
    const parts = createPartsStore();
    const vault = createCredentialsVault();
    const bad = seedLiveShop(shops, {
      providerShopId: 'bad.myshopify.com',
      shopDomain: 'bad.myshopify.com',
      credentialsSecretRef: 'vault:bad',
      merchantUserId: 'M99',
    });
    const good = seedLiveShop(shops, {
      providerShopId: 'good.myshopify.com',
      shopDomain: 'good.myshopify.com',
      credentialsSecretRef: 'vault:good',
      merchantUserId: 'M99',
      nowMs: 5_000,
      liveAtMs: 6_000,
    });
    vault.put('vault:bad', { t: 1 });
    vault.put('vault:good', { t: 2 });
    for (const s of [bad, good]) {
      feedKeys.upsertShopKey({
        provider: 'shopify',
        shopId: s.shopId,
        env: 'live',
        shopDomain: s.shopDomain,
        Active: 1,
      });
      parts.mergeStaging(
        [
          {
            Source: 'shopify',
            FeedKey: s.shopId,
            Env: 'live',
            MerchantProductId: 'p',
            Title: 'P',
            ProductUrl: `https://${s.shopDomain}/p`,
            ContentHash: 'c',
          },
        ],
        'shopify',
        s.shopId,
        'live',
      );
    }
    shops.setConsecutiveUnpaidPeriods(bad.shopId, 2);
    shops.markNoticeSent(
      bad.shopId,
      'N2',
      new Date(Date.now() - N2_MIN_LEAD_MS - 1000).toISOString(),
    );
    shops.setSubscriptionStatus(bad.shopId, 'unpaid');

    const r = await runMerchantDunning({
      shops,
      feedKeys,
      parts,
      vault,
      shopIds: [bad.shopId, good.shopId],
      now: new Date(),
      forceN2Age: true,
    });
    assert.ok(r.results.some((x) => x.deleted && x.shopId === bad.shopId));
    assert.equal(shops.get(bad.shopId).status, 'cancelled');
    assert.equal(shops.get(good.shopId).status, 'live');
    assert.equal(parts.activeForFeed('shopify', good.shopId, 'live').length, 1);
    assert.ok(feedKeys.get('shopify', good.shopId, 'live'));
    assert.ok(isShopPaid(shops.get(good.shopId)));
  });

  it('needsSubscriptionRefresh when cache older than 48h', () => {
    const now = Date.parse('2026-10-15T12:00:00Z');
    assert.equal(
      needsSubscriptionRefresh(
        { subscriptionStatusAt: new Date(now - 49 * 3600000).toISOString() },
        { nowMs: now },
      ),
      true,
    );
    assert.equal(
      needsSubscriptionRefresh(
        { subscriptionStatusAt: new Date(now - 1 * 3600000).toISOString() },
        { nowMs: now },
      ),
      false,
    );
    assert.equal(needsSubscriptionRefresh({}, { nowMs: now }), true);
  });
});
