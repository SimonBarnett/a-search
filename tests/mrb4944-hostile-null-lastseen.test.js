'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createMemoryStore } = require('../walrus/import/src/memoryStore');

describe('MRB #4944 hostile NULL LastSeenRunId', () => {
  it('hard-delete also leaves NULL LastSeenRunId orphans', async () => {
    const store = createMemoryStore({ env: 'live' });
    store.seedPart({
      Source: 'awin',
      FeedKey: 'f1',
      MerchantProductId: 'orphan',
      LastSeenRunId: null,
    });
    await store.mergeFeed({
      runId: 4,
      providerId: 'awin',
      feedKey: 'f1',
      className: 'affiliate',
      staged: [{ MerchantProductId: 'keep', title: 'A', ContentHash: 'h1' }],
      deleteMissing: 'hard',
    });
    const after = [...store.parts.values()];
    assert.ok(after.some((r) => r.MerchantProductId === 'orphan' && !r.DeletedAt));
  });

  it('sqlStore hard-delete SQL also requires LastSeenRunId IS NOT NULL', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'walrus', 'import', 'src', 'sqlStore.js'),
      'utf8',
    );
    const hard = src.slice(src.indexOf("deleteMissing === 'hard'"));
    assert.match(hard, /LastSeenRunId\s+IS\s+NOT\s+NULL/);
  });
});
