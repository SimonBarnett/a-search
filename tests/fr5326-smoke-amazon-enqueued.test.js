'use strict';

/**
 * FR #5326: smoke assertSearchAccept requires amazon in enqueued when present.
 * Unit fixtures only. Do not call AWS.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { assertSearchAccept } = require('../scripts/smoke-deploy');

describe('FR #5326 smoke amazon enqueued', () => {
  it('passes when enqueued includes amazon even if kelkoo is skipped', () => {
    assert.doesNotThrow(() =>
      assertSearchAccept({
        accepted: true,
        searchId: 'srch_smoke',
        enqueued: ['amazon', 'ebay'],
        skipped: [{ id: 'kelkoo', reason: 'missing_queue_url' }],
      }),
    );
  });

  it('fails when enqueued is present without amazon', () => {
    assert.throws(
      () =>
        assertSearchAccept({
          accepted: true,
          searchId: 'srch_smoke',
          enqueued: ['ebay'],
          skipped: [{ id: 'kelkoo', reason: 'missing_queue_url' }],
        }),
      /amazon/i,
    );
  });

  it('passes catalog body with no enqueued field', () => {
    assert.doesNotThrow(() =>
      assertSearchAccept({
        accepted: true,
        searchId: 'srch_smoke',
      }),
    );
  });
});
