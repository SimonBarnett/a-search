'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  fanOutEnqueue,
  EnqueueError,
  resolveEnqueueTargets,
} = require('../entry/src/enqueue');

const DEFAULT_ON = ['amazon', 'ebay', 'awin', 'rakuten', 'cj', 'impact'];

describe('FR-006 fan-out enqueue', () => {
  it('Mock SQS: N calls for N enabled sources', async () => {
    const sent = [];
    const enqueued = await fanOutEnqueue({
      searchId: 'srch_test1',
      userId: 'ABC12345',
      env: 'live',
      body: {
        q: 'headphones',
        catalogId: 123,
        category: 'Electronics',
        subcategory: 'Headphones',
      },
      enabled: () => [...DEFAULT_ON],
      sendMessage: async (payload) => {
        sent.push(payload);
      },
    });
    assert.equal(sent.length, DEFAULT_ON.length);
    assert.deepEqual(enqueued.sort(), [...DEFAULT_ON].sort());
    for (const p of sent) {
      assert.equal(p.searchId, 'srch_test1');
      assert.equal(p.userId, 'ABC12345');
      assert.equal(p.env, 'live');
      assert.equal(p.catalogId, 123);
      assert.equal(p.category, 'Electronics');
      assert.equal(p.subcategory, 'Headphones');
      assert.equal(p.q, 'headphones');
      assert.ok(DEFAULT_ON.includes(p.source));
      assert.equal(p.sandbox, false);
    }
  });

  it('Disabled never called', async () => {
    const sent = [];
    await fanOutEnqueue({
      searchId: 'srch_test2',
      userId: 'U1',
      env: 'sandbox',
      body: {
        q: 'x',
        catalogId: 1,
        category: 'c',
        subcategory: 's',
        sources: ['amazon', 'partnerize'],
      },
      enabled: () => ['amazon', 'ebay'],
      sendMessage: async (payload) => {
        sent.push(payload.source);
      },
    });
    assert.deepEqual(sent, ['amazon']);
    assert.ok(!sent.includes('partnerize'));
  });

  it('sources:["amazon"] → only amazon', async () => {
    const sent = [];
    const enqueued = await fanOutEnqueue({
      searchId: 'srch_test3',
      userId: 'U1',
      env: 'live',
      body: {
        q: 'x',
        catalogId: 1,
        category: 'c',
        subcategory: 's',
        sources: ['amazon'],
      },
      enabled: () => [...DEFAULT_ON],
      sendMessage: async (payload) => {
        sent.push(payload.source);
      },
    });
    assert.deepEqual(sent, ['amazon']);
    assert.deepEqual(enqueued, ['amazon']);
  });

  it('only disabled listed → EnqueueError sources_not_enabled', async () => {
    await assert.rejects(
      () =>
        fanOutEnqueue({
          searchId: 'srch_test4',
          userId: 'U1',
          env: 'live',
          body: {
            q: 'x',
            catalogId: 1,
            category: 'c',
            subcategory: 's',
            sources: ['partnerize', 'webgains'],
          },
          enabled: () => [...DEFAULT_ON],
          sendMessage: async () => {
            throw new Error('should not send');
          },
        }),
      (err) => err instanceof EnqueueError && err.code === 'sources_not_enabled',
    );
  });

  it('resolveEnqueueTargets intersects body.sources with enabled', () => {
    assert.deepEqual(
      resolveEnqueueTargets({
        env: 'live',
        sources: ['amazon', 'partnerize'],
        enabled: () => ['amazon', 'ebay'],
      }),
      ['amazon'],
    );
  });
});
