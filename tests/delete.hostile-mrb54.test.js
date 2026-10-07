'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { scopedDeleteParts, DELETE_SQL } = require('../maintainer/src/delete');

function part(feedKey, merchantId, extra = {}) {
  return {
    Source: 'awin',
    FeedKey: feedKey,
    MerchantProductId: merchantId,
    Env: 'live',
    ContentHash: 'h',
    DeletedAt: null,
    ...extra,
  };
}

describe('MRB #54 hostile: FR-015 scoped delete', () => {
  it('3→2 removes one; other FeedKey untouched; never clears whole Parts', () => {
    const parts = [
      part('adv1', '1'),
      part('adv1', '2'),
      part('adv1', '3'),
      part('adv2', '9'),
    ];
    const staging = [part('adv1', '1'), part('adv1', '2')];
    const result = scopedDeleteParts({
      parts,
      staging,
      source: 'awin',
      feedKey: 'adv1',
      env: 'live',
      now: new Date('2026-10-07T12:00:00.000Z'),
    });
    assert.equal(result.deleted, 1);
    assert.equal(
      result.parts.filter((p) => p.FeedKey === 'adv1' && !p.DeletedAt).length,
      2
    );
    assert.equal(result.parts.find((p) => p.FeedKey === 'adv2').DeletedAt, null);
    assert.ok(result.parts.length >= 4);
  });

  it('005_DeleteMissingParts.sql is scoped soft-delete', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '..', 'maintainer', 'sql', '005_DeleteMissingParts.sql'),
      'utf8'
    );
    assert.match(sql, /DeletedAt|UPDATE/i);
    assert.match(sql, /Source/);
    assert.match(sql, /FeedKey/);
    assert.match(sql, /Env/);
    assert.doesNotMatch(sql, /TRUNCATE\s+TABLE/i);
    assert.match(DELETE_SQL, /Source/);
  });
});
