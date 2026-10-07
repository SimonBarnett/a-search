'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  fanOutEnqueue,
  EnqueueError,
  resolveEnqueueTargets,
} = require('../entry/src/enqueue');

describe('MRB #39 hostile: FR-006 fan-out enqueue', () => {
  it('sources filter intersects enabled; disabled never sent', async () => {
    const sent = [];
    const enqueued = await fanOutEnqueue({
      searchId: 'srch_h1',
      userId: 'U1',
      env: 'live',
      body: {
        q: 'x',
        catalogId: 1,
        category: 'c',
        subcategory: 's',
        sources: ['amazon', 'partnerize'],
      },
      enabled: () => ['amazon', 'ebay'],
      sendMessage: async (p) => {
        sent.push(p.source);
      },
    });
    assert.deepEqual(sent, ['amazon']);
    assert.deepEqual(enqueued, ['amazon']);
  });

  it('only disabled listed → sources_not_enabled', async () => {
    await assert.rejects(
      () =>
        fanOutEnqueue({
          searchId: 'srch_h2',
          userId: 'U1',
          env: 'live',
          body: {
            q: 'x',
            catalogId: 1,
            category: 'c',
            subcategory: 's',
            sources: ['partnerize'],
          },
          enabled: () => ['amazon'],
          sendMessage: async () => {},
        }),
      (err) => err instanceof EnqueueError && err.code === 'sources_not_enabled'
    );
  });

  it('empty enabled without sources filter → 200-style empty enqueued', async () => {
    const sent = [];
    const enqueued = await fanOutEnqueue({
      searchId: 'srch_h3',
      userId: 'U1',
      env: 'sandbox',
      body: { q: 'x', catalogId: 1, category: 'c', subcategory: 's' },
      enabled: () => [],
      sendMessage: async (p) => {
        sent.push(p);
      },
    });
    assert.deepEqual(sent, []);
    assert.deepEqual(enqueued, []);
    assert.deepEqual(resolveEnqueueTargets({ env: 'live', enabled: () => [] }), []);
  });
});
