'use strict';

/**
 * Hostile MRB #4929: gzip magic when compression=none; dbimport safety guard.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { decompressFeedBody } = require('../affiliates/src/decompressFeed');
const { checkSafetyGuard } = require('../tools/dbimport/safety');

describe('MRB #4929 gzip sniff + dbimport safety', () => {
  it('compression=none still gunzips 1f8b bodies', async () => {
    const plain = Buffer.from('aw_deep_link,name\nhttps://x,Widget\n');
    const gz = zlib.gzipSync(plain);
    const out = await decompressFeedBody(gz, { compression: 'none', format: 'csv' });
    assert.equal(out.ok, true);
    assert.deepEqual(out.buffer, plain);
  });

  it('checkSafetyGuard refuses empty feed and >50% remove', () => {
    assert.equal(checkSafetyGuard({ parsedCount: 0, existingActiveCount: 10, wouldRemoveCount: 10 }).ok, false);
    assert.equal(
      checkSafetyGuard({ parsedCount: 1, existingActiveCount: 10, wouldRemoveCount: 6 }).ok,
      false,
    );
    assert.equal(
      checkSafetyGuard({ parsedCount: 8, existingActiveCount: 10, wouldRemoveCount: 2 }).ok,
      true,
    );
  });
});
