'use strict';

/**
 * FR #4113: downloadOne missing_feedurl marker update must not throw
 * feedurl_or_feedid_required via mergeAffiliateMeta / normalizeAffiliateMeta.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeAffiliateMeta,
  mergeAffiliateMeta,
} = require('../shared/affiliates/metadata');
const { createMemoryS3 } = require('../affiliates/src/memoryS3');
const { downloadOne } = require('../affiliates/src/downloadOne');

const BUCKET = 'a-affiliates';
const FIXED = new Date('2026-10-18T14:00:00.000Z');

describe('FR #4113 missing_feedurl via mergeAffiliateMeta', () => {
  it('normalizeAffiliateMeta allows laststatus=missing_feedurl without feedurl/feedid', () => {
    const out = normalizeAffiliateMeta(
      {
        affiliateid: 'shop-x',
        name: 'No Feed Yet',
        laststatus: 'missing_feedurl',
        lastdownload: FIXED.toISOString(),
      },
      { now: FIXED, affiliateId: 'shop-x' },
    );
    assert.equal(out.laststatus, 'missing_feedurl');
    assert.equal(out.affiliateid, 'shop-x');
    assert.ok(!out.feedurl);
    assert.ok(!out.feedid);
  });

  it('normalizeAffiliateMeta still requires feedurl or feedid otherwise', () => {
    assert.throws(
      () =>
        normalizeAffiliateMeta(
          { affiliateid: 'shop-y', name: 'Needs Feed' },
          { now: FIXED },
        ),
      (err) => err && err.code === 'feedurl_or_feedid_required',
    );
  });

  it('mergeAffiliateMeta can stamp missing_feedurl onto meta without feedurl', () => {
    const merged = mergeAffiliateMeta(
      { affiliateid: 'shop-z', name: 'Z', enabled: '1' },
      {
        affiliateid: 'shop-z',
        laststatus: 'missing_feedurl',
        lastdownload: FIXED.toISOString(),
      },
      { now: FIXED },
    );
    assert.equal(merged.laststatus, 'missing_feedurl');
    assert.equal(merged.name, 'Z');
    assert.equal(merged.lastdownload, FIXED.toISOString());
  });

  it('downloadOne writes missing_feedurl marker without throwing', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/nofeed/',
      Body: Buffer.alloc(0),
      Metadata: {
        affiliateid: 'nofeed',
        name: 'No Feed',
        format: 'csv',
        compression: 'none',
        enabled: '1',
        // intentionally no feedurl / feedid
      },
    });

    const r = await downloadOne({
      s3,
      bucket: BUCKET,
      provider: 'awin',
      affiliateId: 'nofeed',
      now: FIXED,
      fetchImpl: async () => {
        throw new Error('fetch_should_not_run');
      },
    });

    assert.equal(r.ok, false);
    assert.equal(r.status, 'missing_feedurl');
    assert.equal(r.error, 'missing_feedurl');

    const head = await s3.headObject({ Key: 'awin/nofeed/' });
    assert.equal(head.Metadata.laststatus, 'missing_feedurl');
    assert.equal(head.Metadata.lastdownload, FIXED.toISOString());
    assert.equal(head.Metadata.name, 'No Feed');
    assert.ok(head.Metadata.lastmod);
  });
});
