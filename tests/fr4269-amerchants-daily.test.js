'use strict';

/**
 * FR #4269: AMerchants scheduled job is daily; only enabled=1 + lastdownload
 * stale (>=7d); affiliates reuse affiliates/src/downloadOne (flat + placeholders).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createMemoryS3 } = require('../merchants/src/memoryS3');
const { runWeekly, STALE_DAYS_MS, isEnabledOne, isLastdownloadStale } = require('../merchants/src/runWeekly');

const ROOT = path.join(__dirname, '..');
const STACK = path.join(ROOT, 'cdk', 'lib', 'merchants-stack.js');
const STAGE = path.join(ROOT, 'scripts', 'stage-merchants-lambda-asset.js');
const RUN = path.join(ROOT, 'merchants', 'src', 'runWeekly.js');

describe('FR #4269 AMerchants daily enabled+stale + affiliates downloadOne', () => {
  it('stack is daily Node 24; stage copies affiliates/src', () => {
    const stack = fs.readFileSync(STACK, 'utf8');
    const stage = fs.readFileSync(STAGE, 'utf8');
    const run = fs.readFileSync(RUN, 'utf8');
    assert.match(stack, /Schedule\.rate\(cdk\.Duration\.days\(1\)\)/);
    assert.doesNotMatch(stack, /Schedule\.rate\(cdk\.Duration\.days\(7\)\)/);
    assert.match(stack, /NODEJS_24_X/);
    assert.doesNotMatch(stack, /NODEJS_20_X/);
    assert.match(stage, /affiliates[/\\]src|affiliates', 'src'/);
    assert.match(run, /affiliates\/src\/downloadOne/);
    assert.doesNotMatch(run, /downloadAffiliateOne/);
  });

  it('helpers: missing enabled is off; stale uses lastdownload', () => {
    assert.equal(isEnabledOne({}), false);
    assert.equal(isEnabledOne({ enabled: '0' }), false);
    assert.equal(isEnabledOne({ enabled: '1' }), true);
    const now = new Date('2026-10-18T12:00:00.000Z');
    assert.equal(isLastdownloadStale({}, now), true);
    assert.equal(
      isLastdownloadStale({ lastdownload: '2026-10-17T12:00:00.000Z' }, now),
      false,
    );
    assert.equal(
      isLastdownloadStale({ lastdownload: '2026-10-10T12:00:00.000Z' }, now),
      true,
    );
    assert.ok(STALE_DAYS_MS >= 7 * 86400000);
  });

  it('skips affiliate with no enabled; downloads enabled stale with flat key + placeholder sub', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: 'a-affiliates',
      Key: 'awin/',
      Body: Buffer.alloc(0),
      Metadata: { name: 'Awin', feedapikey: 'FAKE_feed_key_4269' },
    });
    await s3.putObject({
      Bucket: 'a-affiliates',
      Key: 'awin/noflag/',
      Body: Buffer.alloc(0),
      Metadata: {
        affiliateid: 'noflag',
        feedurl: 'https://example.invalid/noflag.csv',
        format: 'csv',
        compression: 'none',
      },
    });
    await s3.putObject({
      Bucket: 'a-affiliates',
      Key: 'awin/fresh/',
      Body: Buffer.alloc(0),
      Metadata: {
        affiliateid: 'fresh',
        feedurl: 'https://example.invalid/fresh.csv',
        format: 'csv',
        compression: 'none',
        enabled: '1',
        lastdownload: '2026-10-17T12:00:00.000Z',
      },
    });
    await s3.putObject({
      Bucket: 'a-affiliates',
      Key: 'awin/stale/',
      Body: Buffer.alloc(0),
      Metadata: {
        affiliateid: 'stale',
        feedurl: 'https://example.invalid/feed.csv?key={feedapikey}',
        format: 'csv',
        compression: 'none',
        enabled: '1',
        lastdownload: '2026-10-01T12:00:00.000Z',
      },
    });

    const seenUrls = [];
    const fetchImpl = async (url) => {
      seenUrls.push(String(url));
      return {
        ok: true,
        status: 200,
        body: Buffer.from('sku,price\n1,2\n', 'utf8'),
      };
    };

    const now = new Date('2026-10-18T12:00:00.000Z');
    const summary = await runWeekly({
      s3,
      merchantsBucket: 'a-merchants-empty',
      affiliatesBucket: 'a-affiliates',
      fetchImpl,
      now,
    });

    const aff = summary.affiliates.results;
    const noflag = aff.find((r) => r.affiliateId === 'noflag' || r.affiliateid === 'noflag');
    const fresh = aff.find((r) => r.affiliateId === 'fresh' || r.affiliateid === 'fresh');
    const stale = aff.find((r) => r.affiliateId === 'stale' || r.affiliateid === 'stale');
    assert.ok(noflag && (noflag.status === 'disabled' || noflag.skipped), 'no enabled skipped');
    assert.ok(fresh && (fresh.status === 'not_stale' || fresh.skipped), 'fresh skipped');
    assert.ok(stale && stale.ok, 'stale downloaded');
    assert.ok(
      s3.objects.has('awin/stale/2026-10-18.csv'),
      'flat dated key from affiliates downloadOne',
    );
    assert.equal(s3.objects.has('awin/stale/parts/2026-10-18.csv'), false);
    assert.ok(
      seenUrls.some((u) => u.includes('FAKE_feed_key_4269') && !u.includes('{feedapikey}')),
      'placeholder substituted for fetch',
    );
  });
});
