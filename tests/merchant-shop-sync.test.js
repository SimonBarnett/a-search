'use strict';

/**
 * FR-240 / #1354: shop go-live full import + weekly refresh + unpaid/auth gates.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-240.md');
const MIGRATION = path.join(
  ROOT,
  'db',
  'migrations',
  '012_PartFeedKeys_shop_kind.sql',
);

const { createShopsRegistry } = require('../shared/shops/registry');
const { createCredentialsVault } = require('../shared/shops/vault');
const {
  createPartFeedKeysStore,
  createPartsStore,
  createShopSyncQueue,
  onShopLive,
  rollShopRefresh,
  handleShopSyncMessage,
  onShopStopServing,
  buildFullSyncMessage,
  isShopPaid,
  assertNoCredentials,
} = require('../shared/shops/shopSync');

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
  });
  return shops.transition(row.shopId, 'live', {
    nowMs: opts.liveAtMs || 2_000,
  });
}

describe('FR-240 merchant shop sync', () => {
  it('docs Decision LOCKED + migration Kind/Active; ASCII no-BOM', () => {
    const buf = fs.readFileSync(FR_DOC);
    assert.notEqual(buf[0], 0xef);
    for (const b of buf) assert.ok(b < 128, 'FR-240.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /MessageGroupId/);
    assert.match(text, /skipped_unpaid|unpaid/i);
    assert.match(text, /FR-251/);
    const mig = fs.readFileSync(MIGRATION, 'utf8');
    assert.match(mig, /Kind/);
    assert.match(mig, /Active/);
    assert.match(mig, /Locator/);
    assert.match(mig, /a_search|FR-251/i);
  });

  it('isShopPaid: active only; trialing unpaid', () => {
    assert.equal(isShopPaid({ subscriptionStatus: 'active' }), true);
    assert.equal(isShopPaid({ subscriptionStatus: 'trialing' }), false);
    assert.equal(isShopPaid({ subscriptionStatus: 'past_due' }), false);
    assert.equal(isShopPaid({}), false);
  });

  it('go-live -> full import of fixture products; re-delivery no duplicates', async () => {
    const shops = createShopsRegistry();
    const feedKeys = createPartFeedKeysStore();
    const parts = createPartsStore();
    const queue = createShopSyncQueue();
    const vault = createCredentialsVault();
    vault.put('vault:shopify:demo', { kind: 'shopify_offline', accessToken: 'shpat_x' });
    const shop = seedLiveShop(shops, {});

    const live = onShopLive({ shop, feedKeys, queue, now: new Date('2026-10-15T12:00:00Z') });
    assert.equal(live.enqueued, true);
    const key = feedKeys.get('shopify', shop.shopId, 'live');
    assert.equal(key.Kind, 'shop');
    assert.equal(key.Active, 1);
    assert.equal(key.Locator, 'demo.myshopify.com');

    const pending = queue.pending();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].body.type, 'full');
    assert.equal(pending[0].MessageGroupId, shop.shopId);
    assertNoCredentials(pending[0].body);
    assert.ok(!JSON.stringify(pending[0].body).includes('shpat_'));

    let catalogCalls = 0;
    const fetchCatalog = async () => {
      catalogCalls += 1;
      return [
        { id: 'p1', title: 'Hat', url: 'https://demo.myshopify.com/products/hat' },
        { id: 'p2', title: 'Mug', url: 'https://demo.myshopify.com/products/mug' },
      ];
    };

    const msg = queue.receive(shop.shopId);
    const r1 = await handleShopSyncMessage({
      message: msg,
      shops,
      feedKeys,
      parts,
      vault,
      queue,
      fetchCatalog,
      now: new Date('2026-10-15T12:01:00Z'),
    });
    assert.equal(r1.ok, true);
    assert.equal(r1.partsCount, 2);
    assert.equal(catalogCalls, 1);
    assert.equal(shops.get(shop.shopId).partsCount, 2);
    assert.equal(shops.get(shop.shopId).lastSyncResult, 'ok');

    // Re-send same dedupe id -> not queued again
    const again = queue.send(buildFullSyncMessage(shops.get(shop.shopId)));
    assert.equal(again.sent, false);
    assert.equal(again.reason, 'duplicate');

    // Manual re-delivery of same products -> still 2 rows (MERGE)
    queue.send({
      MessageGroupId: shop.shopId,
      MessageDeduplicationId: `${shop.shopId}:full:sub_1:replay`,
      body: {
        type: 'full',
        env: 'live',
        shopId: shop.shopId,
        provider: 'shopify',
      },
    });
    const msg2 = queue.receive(shop.shopId);
    await handleShopSyncMessage({
      message: msg2,
      shops,
      feedKeys,
      parts,
      vault,
      queue,
      fetchCatalog,
      now: new Date('2026-10-15T12:02:00Z'),
    });
    assert.equal(parts.activeForFeed('shopify', shop.shopId, 'live').length, 2);
  });

  it('product removed upstream -> soft-deleted on refresh', async () => {
    const shops = createShopsRegistry();
    const feedKeys = createPartFeedKeysStore();
    const parts = createPartsStore();
    const queue = createShopSyncQueue();
    const vault = createCredentialsVault();
    vault.put('vault:shopify:demo', { accessToken: 't' });
    const shop = seedLiveShop(shops, {});
    onShopLive({ shop, feedKeys, queue, now: new Date('2026-01-01T00:00:00Z') });
    await handleShopSyncMessage({
      message: queue.receive(shop.shopId),
      shops,
      feedKeys,
      parts,
      vault,
      queue,
      fetchCatalog: async () => [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
      ],
      now: new Date('2026-01-01T00:01:00Z'),
    });
    assert.equal(parts.activeForFeed('shopify', shop.shopId, 'live').length, 2);

    // Force due
    feedKeys.upsertShopKey({
      provider: 'shopify',
      shopId: shop.shopId,
      env: 'live',
      shopDomain: shop.shopDomain,
      NextCheck: new Date('2026-01-01T00:00:00Z'),
      Active: 1,
    });
    const roll = rollShopRefresh({
      feedKeys,
      shops,
      queue,
      now: new Date('2026-01-08T00:00:00Z'),
      env: 'live',
    });
    assert.equal(roll.enqueued.length, 1);
    await handleShopSyncMessage({
      message: queue.receive(shop.shopId),
      shops,
      feedKeys,
      parts,
      vault,
      queue,
      fetchCatalog: async () => [{ id: 'a', title: 'A' }],
      now: new Date('2026-01-08T00:01:00Z'),
    });
    const active = parts.activeForFeed('shopify', shop.shopId, 'live');
    assert.equal(active.length, 1);
    assert.equal(active[0].MerchantProductId, 'a');
    const soft = parts
      .all()
      .filter((p) => p.MerchantProductId === 'b' && p.DeletedAt);
    assert.equal(soft.length, 1);
  });

  it('roll skips suspended; enqueues only live paid due shops', () => {
    const shops = createShopsRegistry();
    const feedKeys = createPartFeedKeysStore();
    const queue = createShopSyncQueue();
    const live = seedLiveShop(shops, { providerShopId: 'a.myshopify.com', shopDomain: 'a.myshopify.com' });
    const sus = seedLiveShop(shops, {
      providerShopId: 'b.myshopify.com',
      shopDomain: 'b.myshopify.com',
      credentialsSecretRef: 'vault:shopify:b',
      nowMs: 3_000,
      liveAtMs: 4_000,
    });
    shops.transition(sus.shopId, 'suspended', { reason: 'auth', nowMs: 5_000 });
    onShopLive({ shop: live, feedKeys, queue, now: new Date('2026-02-01T00:00:00Z') });
    // drain go-live full message so roll only sees refresh sends
    const drained = queue.receive(live.shopId);
    if (drained) queue.deleteMessage(drained.id);
    // mark both due (suspended shop still has Active feed key)
    feedKeys.upsertShopKey({
      provider: 'shopify',
      shopId: live.shopId,
      env: 'live',
      shopDomain: live.shopDomain,
      NextCheck: new Date('2026-01-01T00:00:00Z'),
      Active: 1,
    });
    feedKeys.upsertShopKey({
      provider: 'shopify',
      shopId: sus.shopId,
      env: 'live',
      shopDomain: sus.shopDomain,
      NextCheck: new Date('2026-01-01T00:00:00Z'),
      Active: 1,
    });
    assert.equal(feedKeys.listDueShopKeys({ now: new Date('2026-02-10T00:00:00Z'), env: 'live' }).length, 2);
    assert.equal(shops.get(sus.shopId).status, 'suspended');
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
    assert.equal(roll.enqueued[0].shopId, live.shopId);
    assert.ok(
      !roll.enqueued.some((e) => e.shopId === sus.shopId),
      'suspended shop must not enqueue',
    );
    assert.ok(logs.some((l) => l.reason === 'not_live' && l.shopId === sus.shopId));
  });

  it('401 -> suspended(auth) + email stub; 429 -> backoff retry', async () => {
    const shops = createShopsRegistry();
    const feedKeys = createPartFeedKeysStore();
    const parts = createPartsStore();
    const queue = createShopSyncQueue();
    const vault = createCredentialsVault();
    vault.put('vault:shopify:demo', { accessToken: 't' });
    const shop = seedLiveShop(shops, {});
    onShopLive({ shop, feedKeys, queue, now: new Date() });
    const emails = [];
    const msg = queue.receive(shop.shopId);
    const auth = await handleShopSyncMessage({
      message: msg,
      shops,
      feedKeys,
      parts,
      vault,
      queue,
      fetchCatalog: async () => {
        const e = new Error('unauthorized');
        e.statusCode = 401;
        e.code = 'auth';
        throw e;
      },
      sendEmail: async (m) => emails.push(m),
      now: new Date(),
    });
    assert.equal(auth.reason, 'auth');
    assert.equal(shops.get(shop.shopId).status, 'suspended');
    assert.equal(shops.get(shop.shopId).suspendReason, 'auth');
    assert.equal(feedKeys.get('shopify', shop.shopId, 'live').Active, 0);
    assert.equal(emails.length, 1);

    // fresh live shop for 429
    const shops2 = createShopsRegistry();
    const feedKeys2 = createPartFeedKeysStore();
    const queue2 = createShopSyncQueue();
    const shop2 = seedLiveShop(shops2, {
      providerShopId: 'r.myshopify.com',
      shopDomain: 'r.myshopify.com',
      credentialsSecretRef: 'vault:shopify:r',
    });
    onShopLive({ shop: shop2, feedKeys: feedKeys2, queue: queue2, now: new Date() });
    const msg429 = queue2.receive(shop2.shopId);
    const back = await handleShopSyncMessage({
      message: msg429,
      shops: shops2,
      feedKeys: feedKeys2,
      parts: createPartsStore(),
      vault: createCredentialsVault(),
      queue: queue2,
      fetchCatalog: async () => {
        const e = new Error('slow down');
        e.statusCode = 429;
        throw e;
      },
      now: new Date(),
    });
    assert.equal(back.reason, 'backoff');
    assert.equal(back.hours, 1);
    assert.ok(feedKeys2.get('shopify', shop2.shopId, 'live').NextCheck);
    assert.equal(queue2.pending().length, 1, 'message left for retry');
  });

  it('suspend soft-deletes FeedKey Parts; other shops untouched', async () => {
    const shops = createShopsRegistry();
    const feedKeys = createPartFeedKeysStore();
    const parts = createPartsStore();
    const queue = createShopSyncQueue();
    const vault = createCredentialsVault();
    vault.put('vault:shopify:a', { accessToken: 'a' });
    vault.put('vault:shopify:b', { accessToken: 'b' });
    const a = seedLiveShop(shops, {
      providerShopId: 'a.myshopify.com',
      shopDomain: 'a.myshopify.com',
      credentialsSecretRef: 'vault:shopify:a',
    });
    const b = seedLiveShop(shops, {
      providerShopId: 'b.myshopify.com',
      shopDomain: 'b.myshopify.com',
      credentialsSecretRef: 'vault:shopify:b',
      nowMs: 9_000,
      liveAtMs: 10_000,
    });
    for (const shop of [a, b]) {
      onShopLive({ shop, feedKeys, queue, now: new Date() });
      await handleShopSyncMessage({
        message: queue.receive(shop.shopId),
        shops,
        feedKeys,
        parts,
        vault,
        queue,
        fetchCatalog: async () => [
          { id: `${shop.shopId}-1`, title: 'x' },
          { id: `${shop.shopId}-2`, title: 'y' },
        ],
        now: new Date(),
      });
    }
    assert.equal(parts.activeForFeed('shopify', a.shopId, 'live').length, 2);
    assert.equal(parts.activeForFeed('shopify', b.shopId, 'live').length, 2);

    shops.transition(a.shopId, 'suspended', { reason: 'cancel', nowMs: Date.now() });
    onShopStopServing({ shop: shops.get(a.shopId), feedKeys, parts, now: new Date() });
    assert.equal(parts.activeForFeed('shopify', a.shopId, 'live').length, 0);
    assert.equal(parts.activeForFeed('shopify', b.shopId, 'live').length, 2);
    assert.equal(feedKeys.get('shopify', a.shopId, 'live').Active, 0);
  });

  it('message enqueued while paid, consumed after past_due -> no catalogue call', async () => {
    const shops = createShopsRegistry();
    const feedKeys = createPartFeedKeysStore();
    const parts = createPartsStore();
    const queue = createShopSyncQueue();
    const vault = createCredentialsVault();
    vault.put('vault:shopify:demo', { accessToken: 't' });
    const shop = seedLiveShop(shops, {});
    onShopLive({ shop, feedKeys, queue, now: new Date() });
    shops.setSubscriptionStatus(shop.shopId, 'past_due');
    let catalogCalls = 0;
    const msg = queue.receive(shop.shopId);
    const r = await handleShopSyncMessage({
      message: msg,
      shops,
      feedKeys,
      parts,
      vault,
      queue,
      fetchCatalog: async () => {
        catalogCalls += 1;
        return [{ id: 'should-not-run' }];
      },
      now: new Date(),
    });
    assert.equal(r.skipped, true);
    assert.equal(r.reason, 'unpaid');
    assert.equal(catalogCalls, 0);
    assert.equal(shops.get(shop.shopId).lastSyncResult, 'skipped_unpaid');
    assert.equal(parts.activeForFeed('shopify', shop.shopId, 'live').length, 0);
  });

  it('unpaid go-live does not enqueue; SQS body never has credential fields', () => {
    const shops = createShopsRegistry();
    const feedKeys = createPartFeedKeysStore();
    const queue = createShopSyncQueue();
    const shop = seedLiveShop(shops, { subscriptionStatus: 'trialing' });
    const logs = [];
    const r = onShopLive({
      shop,
      feedKeys,
      queue,
      now: new Date(),
      log: (e) => logs.push(e),
    });
    assert.equal(r.enqueued, false);
    assert.equal(r.reason, 'unpaid');
    assert.equal(queue.pending().length, 0);
    assert.ok(logs.some((l) => l.reason === 'unpaid'));

    assert.throws(
      () =>
        assertNoCredentials({
          type: 'full',
          shopId: 'x',
          accessToken: 'secret',
        }),
      (e) => e && e.code === 'sync_message_must_not_carry_credentials',
    );
  });
});
