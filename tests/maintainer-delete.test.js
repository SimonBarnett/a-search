'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  scopedDeleteParts,
  DELETE_SQL,
} = require('../maintainer/src/delete');

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

describe('FR-015 scoped delete Parts', () => {
  it('3 parts → refresh 2 → one removed; other FeedKey untouched', () => {
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
    const adv1 = result.parts.filter(
      (p) => p.FeedKey === 'adv1' && !p.DeletedAt,
    );
    const removed = result.parts.filter(
      (p) => p.FeedKey === 'adv1' && p.DeletedAt,
    );
    const adv2 = result.parts.filter((p) => p.FeedKey === 'adv2');
    assert.equal(adv1.length, 2);
    assert.equal(removed.length, 1);
    assert.equal(removed[0].MerchantProductId, '3');
    assert.equal(adv2.length, 1);
    assert.equal(adv2[0].DeletedAt, null);
    assert.equal(result.deleted, 1);
  });

  it('never truncates whole Parts (other source/env untouched)', () => {
    const parts = [
      part('adv1', 'gone'),
      part('adv1', 'keep'),
      { ...part('adv1', 'sand'), Env: 'sandbox' },
      { ...part('adv1', 'ebay1'), Source: 'ebay' },
    ];
    const staging = [part('adv1', 'keep')];
    const result = scopedDeleteParts({
      parts,
      staging,
      source: 'awin',
      feedKey: 'adv1',
      env: 'live',
      now: new Date('2026-10-07T12:00:00.000Z'),
    });
    assert.equal(
      result.parts.find((p) => p.MerchantProductId === 'gone').DeletedAt != null,
      true,
    );
    assert.equal(
      result.parts.find((p) => p.MerchantProductId === 'sand').DeletedAt,
      null,
    );
    assert.equal(
      result.parts.find((p) => p.MerchantProductId === 'ebay1').DeletedAt,
      null,
    );
    assert.equal(result.parts.length, 4, 'no hard truncate of table');
  });

  it('DELETE SQL is scoped (no TRUNCATE)', () => {
    const sqlPath = path.join(
      __dirname,
      '..',
      'maintainer',
      'sql',
      '005_DeleteMissingParts.sql',
    );
    assert.ok(fs.existsSync(sqlPath));
    const text = fs.readFileSync(sqlPath, 'utf8');
    assert.match(text, /FeedKey/i);
    assert.match(text, /PartsStaging/i);
    // Forbid truncate as a statement (comments may mention avoiding it).
    assert.doesNotMatch(text, /^\s*TRUNCATE\b/im);
    assert.ok(DELETE_SQL.includes('FeedKey'));
  });
});
