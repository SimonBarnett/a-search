'use strict';

/**
 * FR-2139: CDK SQS FIFO a-search-shop-sync.fifo + DLQ + shopSyncWorker.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const STACK = path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js');
const WORKER = path.join(ROOT, 'maintainer', 'src', 'shopSyncWorker.js');
const FR = path.join(ROOT, 'docs', 'fr', 'FR-2139.md');

function utf8NoBom(abs) {
  const buf = fs.readFileSync(abs);
  assert.notEqual(buf[0], 0xef, `${path.basename(abs)} must be UTF-8 without BOM`);
  return buf.toString('utf8');
}

describe('FR-2139 shop-sync FIFO CDK wiring', () => {
  it('stack wires FIFO queue + DLQ maxReceiveCount 5 + shopSyncWorker event source', () => {
    const text = utf8NoBom(STACK);
    assert.match(text, /FR-2139/);
    assert.match(text, /a-search-shop-sync\.fifo/);
    assert.match(text, /a-search-shop-sync-dlq\.fifo/);
    assert.match(text, /fifo:\s*true/);
    assert.match(text, /SHOP_SYNC_MAX_RECEIVE_COUNT\s*=\s*5|maxReceiveCount:\s*SHOP_SYNC_MAX_RECEIVE_COUNT/);
    assert.match(text, /ShopSyncFifoQueue|ShopSyncDeadLetterQueue/);
    assert.match(text, /shopSyncWorker\.handler/);
    assert.match(text, /SQS_SHOP_SYNC_URL/);
    assert.match(text, /SHOP_SYNC_QUEUE_VISIBILITY_TIMEOUT_SEC/);
    assert.match(text, /SqsEventSource\(shopSyncQueue/);
    assert.match(text, /grantSendMessages\(entry\)/);
    assert.match(text, /onShopLive|FR-239/);
  });

  it('shopSyncWorker maps SQS records and throws on backoff', async () => {
    const {
      handler,
      recordToShopSyncMessage,
      buildShopSyncDeps,
    } = require('../maintainer/src/shopSyncWorker');
    const { createShopsRegistry } = require('../shared/shops/registry');
    const {
      createPartFeedKeysStore,
      createPartsStore,
      createShopSyncQueue,
    } = require('../shared/shops/shopSync');

    const msg = recordToShopSyncMessage({
      messageId: 'm1',
      body: JSON.stringify({
        type: 'full',
        env: 'live',
        shopId: 'shop-1',
        provider: 'woocommerce',
      }),
      attributes: { MessageGroupId: 'shop-1', ApproximateReceiveCount: '2' },
    });
    assert.equal(msg.MessageGroupId, 'shop-1');
    assert.equal(msg.receiveCount, 2);
    assert.equal(msg.body.shopId, 'shop-1');

    const shops = createShopsRegistry();
    const row = shops.insert({
      merchantUserId: 'M1',
      env: 'live',
      provider: 'shopify',
      providerShopId: 'demo.myshopify.com',
      shopDomain: 'demo.myshopify.com',
      credentialsSecretRef: 'vault:shopify:demo',
      nowMs: 1000,
    });
    shops.setSubscriptionStatus(row.shopId, 'active', {
      stripeSubscriptionId: 'sub_1',
    });
    const live = shops.transition(row.shopId, 'live', { nowMs: 2000 });
    const feedKeys = createPartFeedKeysStore();
    const parts = createPartsStore();
    const queue = createShopSyncQueue();
    const deps = buildShopSyncDeps({
      shops,
      feedKeys,
      parts,
      queue,
      vault: { get: () => ({}) },
      fetchCatalog: async () => {
        const err = new Error('rate');
        err.statusCode = 429;
        throw err;
      },
    });

    await assert.rejects(
      () =>
        handler(
          {
            Records: [
              {
                messageId: 'm1',
                body: JSON.stringify({
                  type: 'full',
                  env: 'live',
                  shopId: live.shopId,
                  provider: 'shopify',
                }),
                attributes: {
                  MessageGroupId: live.shopId,
                  ApproximateReceiveCount: '1',
                },
              },
            ],
          },
          deps,
        ),
      /shop_sync_backoff/,
    );

    const workerSrc = utf8NoBom(WORKER);
    assert.match(workerSrc, /handleShopSyncMessage/);
    assert.match(workerSrc, /ApproximateReceiveCount/);
  });

  it('docs Decision LOCKED ASCII; FR-240 points at FR-2139', () => {
    const fr = utf8NoBom(FR);
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(fr), 'FR-2139.md ASCII');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /maxReceiveCount:\s*5|maxReceiveCount 5/);
    assert.match(fr, /shopSyncWorker/);
    assert.match(fr, /FR-239/);

    const fr240 = utf8NoBom(path.join(ROOT, 'docs', 'fr', 'FR-240.md'));
    assert.match(fr240, /FR-2139|#2139/);
  });
});
