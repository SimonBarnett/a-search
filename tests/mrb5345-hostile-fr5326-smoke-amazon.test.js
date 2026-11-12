'use strict';

/**
 * MRB #5345 hostile: FR #5326 amazon must be in enqueued; skipped is not a substitute.
 * Unit fixtures only. Do not call AWS.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { assertSearchAccept } = require('../scripts/smoke-deploy');

const PIN = path.join(__dirname, 'fr5326-smoke-amazon-enqueued.test.js');

describe('MRB #5345 hostile FR #5326 smoke amazon enqueued', () => {
  it('implementer pin exists and does not call AWS', () => {
    assert.ok(fs.existsSync(PIN));
    const text = fs.readFileSync(PIN, 'utf8');
    assert.doesNotMatch(text, /\bfetch\s*\(/);
    assert.doesNotMatch(text, /execute-api|amazonaws\.com/i);
  });

  it('empty enqueued array fails; skipped amazon does not count as enqueued', () => {
    assert.throws(
      () =>
        assertSearchAccept({
          accepted: true,
          searchId: 'srch_smoke',
          enqueued: [],
        }),
      /amazon/i,
    );
    assert.throws(
      () =>
        assertSearchAccept({
          accepted: true,
          searchId: 'srch_smoke',
          enqueued: ['ebay'],
          skipped: [{ id: 'amazon', reason: 'missing_queue_url' }],
        }),
      /amazon/i,
    );
  });

  it('non-array enqueued fails; catalog path without the key still passes', () => {
    assert.throws(
      () =>
        assertSearchAccept({
          accepted: true,
          searchId: 'srch_smoke',
          enqueued: 'amazon',
        }),
      /amazon/i,
    );
    assert.doesNotThrow(() =>
      assertSearchAccept({ accepted: true, searchId: 'srch_smoke' }),
    );
  });
});
