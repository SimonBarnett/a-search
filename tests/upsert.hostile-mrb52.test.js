'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { mergePartsSetBased, MERGE_SQL } = require('../maintainer/src/upsert');

const KEY = { Source: 'awin', FeedKey: 'adv1', Env: 'live' };

function part(merchantId, hash, title = 'T') {
  return {
    ...KEY,
    MerchantProductId: merchantId,
    Title: title,
    ContentHash: hash,
  };
}

describe('MRB #52 hostile: FR-014 MERGE upsert', () => {
  it('single set-based batch; identical second run → changed 0', () => {
    const staging = [part('1', 'h1'), part('2', 'h2')];
    const calls = [];
    const first = mergePartsSetBased({
      staging,
      parts: [],
      applyBatch: (batch) => {
        calls.push(batch.slice());
        return {
          inserted: batch.filter((r) => r._op === 'insert').length,
          updated: batch.filter((r) => r._op === 'update').length,
        };
      },
    });
    assert.equal(calls.length, 1);
    assert.ok(!calls[0].some((r) => r._op === 'row_insert_loop'));
    const second = mergePartsSetBased({ staging, parts: first.parts });
    assert.equal(second.changed, 0);
  });

  it('004_MergeParts.sql is set-based MERGE scoped by Source/FeedKey/Env', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '..', 'maintainer', 'sql', '004_MergeParts.sql'),
      'utf8'
    );
    assert.match(sql, /\bMERGE\b/i);
    assert.match(sql, /Source/);
    assert.match(sql, /FeedKey/);
    assert.match(sql, /Env/);
    assert.match(MERGE_SQL, /\bMERGE\b/i);
  });
});
