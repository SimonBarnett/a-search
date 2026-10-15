'use strict';

/**
 * MRB #2227 hostile: shopSyncWorker must not treat Lambda context as deps /
 * silently delete FIFO messages on the default empty registry.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const {
  handler,
  resolveShopSyncDeps,
  isShopSyncDeps,
} = require('../maintainer/src/shopSyncWorker');

describe('MRB #2227 hostile FR-2139 shop-sync deps gate', () => {
  it('rejects AWS Lambda context as deps; fail-closed without overrides', async () => {
    assert.equal(isShopSyncDeps({ awsRequestId: 'abc' }), false);
    assert.equal(
      resolveShopSyncDeps({
        awsRequestId: 'abc',
        getRemainingTimeInMillis: () => 1000,
      }),
      undefined,
    );
    assert.ok(isShopSyncDeps({ shops: {} }));

    await assert.rejects(
      () =>
        handler(
          { Records: [] },
          {
            awsRequestId: 'aws-req',
            invokedFunctionArn: 'arn:aws:lambda:eu-west-2:1:function:x',
            functionName: 'a-search-shop-sync-worker',
          },
        ),
      /shop_sync_deps_unconfigured/,
    );

    const ok = await handler(
      { Records: [] },
      {},
      { queue: { deleteMessage() {} } },
    );
    assert.equal(ok.ok, true);
  });

  it('stack + worker pins: FIFO DLQ 5, visibility 6x, unconfigured throw', () => {
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /SHOP_SYNC_MAX_RECEIVE_COUNT\s*=\s*5/);
    assert.match(stack, /SHOP_SYNC_LAMBDA_TIMEOUT_SEC\s*=\s*300/);
    assert.match(
      stack,
      /SHOP_SYNC_QUEUE_VISIBILITY_TIMEOUT_SEC\s*=\s*SHOP_SYNC_LAMBDA_TIMEOUT_SEC\s*\*\s*6/,
    );
    assert.match(stack, /SqsEventSource\(shopSyncQueue/);
    assert.match(stack, /grantSendMessages\(entry\)/);

    const worker = fs.readFileSync(
      path.join(ROOT, 'maintainer', 'src', 'shopSyncWorker.js'),
      'utf8',
    );
    assert.match(worker, /shop_sync_deps_unconfigured/);
    assert.doesNotMatch(
      worker,
      /async function handler\(event,\s*deps\)/,
    );
  });
});
