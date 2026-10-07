'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  mergePartsSetBased,
  upsertParts,
  MERGE_SQL,
} = require('../maintainer/src/upsert');

const KEY = {
  Source: 'awin',
  FeedKey: 'adv1',
  Env: 'live',
};

function part(merchantId, hash, title = 'T') {
  return {
    ...KEY,
    MerchantProductId: merchantId,
    Title: title,
    ContentHash: hash,
  };
}

describe('FR-014 staging MERGE upsert', () => {
  it('fixture upsert is set-based (single batch, no per-row INSERT loop)', () => {
    const staging = [part('1', 'h1', 'A'), part('2', 'h2', 'B')];
    const calls = [];
    const result = mergePartsSetBased({
      staging,
      parts: [],
      applyBatch: (batch) => {
        calls.push(batch.slice());
        return { inserted: batch.filter((r) => r._op === 'insert').length,
          updated: batch.filter((r) => r._op === 'update').length };
      },
    });
    assert.equal(calls.length, 1, 'exactly one set-based batch');
    assert.equal(calls[0].length, 2);
    assert.ok(!calls[0].some((r) => r._op === 'row_insert_loop'));
    assert.equal(result.changed, 2);
    assert.equal(result.parts.length, 2);
  });

  it('identical second run → no churn / hashes unchanged', () => {
    const staging = [part('1', 'h1', 'A'), part('2', 'h2', 'B')];
    const first = mergePartsSetBased({ staging, parts: [] });
    const hashesBefore = first.parts.map((p) => p.ContentHash).sort();
    const second = mergePartsSetBased({ staging, parts: first.parts });
    assert.equal(second.changed, 0);
    assert.equal(second.inserted, 0);
    assert.equal(second.updated, 0);
    assert.deepEqual(
      second.parts.map((p) => p.ContentHash).sort(),
      hashesBefore,
    );
  });

  it('upsertParts wires staging then merge via injectables', async () => {
    const loaded = [];
    const merged = [];
    await upsertParts({
      source: KEY.Source,
      feedKey: KEY.FeedKey,
      env: KEY.Env,
      rows: [part('9', 'hx', 'X')],
      clearStaging: async () => {},
      bulkLoadStaging: async (rows) => {
        loaded.push(...rows);
      },
      runMerge: async () => {
        merged.push(true);
        return { inserted: 1, updated: 0 };
      },
    });
    assert.equal(loaded.length, 1);
    assert.equal(merged.length, 1);
  });

  it('MERGE SQL script exists and is set-based', () => {
    const sqlPath = path.join(
      __dirname,
      '..',
      'maintainer',
      'sql',
      '004_MergeParts.sql',
    );
    assert.ok(fs.existsSync(sqlPath));
    const text = fs.readFileSync(sqlPath, 'utf8');
    assert.match(text, /\bMERGE\b/i);
    assert.match(text, /PartsStaging/i);
    assert.doesNotMatch(text, /WHILE\s*@/i);
    assert.ok(MERGE_SQL.includes('MERGE'));
  });
});
