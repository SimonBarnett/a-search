'use strict';

/**
 * FR #4176: substitute {feedapikey}/{darwinhash}/{feedid} for fetch only;
 * affiliate marker keeps placeholders; never persist or log secrets.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  listFeedUrlPlaceholders,
  resolveFeedUrlForFetch,
} = require('../affiliates/src/resolveFeedUrl');
const { createMemoryS3 } = require('../affiliates/src/memoryS3');
const { downloadOne } = require('../affiliates/src/downloadOne');
const {
  folderDownloadOne,
  redactResult,
} = require('../affiliates/src/folderDownloadOne');
const { runWeekly } = require('../affiliates/src/runWeekly');
const {
  normalizeAffiliateMeta,
} = require('../shared/affiliates/metadata');

const BUCKET = 'a-affiliates';
const NOW = new Date('2026-10-18T14:00:00.000Z');
const FAKE_FEEDAPIKEY = 'FAKE_feedapikey_example_only';
const FAKE_DARWIN = 'FAKE_darwinhash_example_only';
const PLACEHOLDER_FEED =
  'https://productdata.example.invalid/datafeed/download/apikey/{feedapikey}/fid/{feedid}/format/csv';

describe('FR #4176 resolveFeedUrl', () => {
  it('lists unique placeholder names', () => {
    assert.deepEqual(
      listFeedUrlPlaceholders(
        'https://x/{feedapikey}/y/{feedid}/{feedapikey}',
      ),
      ['feedapikey', 'feedid'],
    );
    assert.deepEqual(listFeedUrlPlaceholders('https://plain.example/feed'), []);
  });

  it('substitutes provider + affiliate values with URI encoding', () => {
    const r = resolveFeedUrlForFetch({
      feedurl: PLACEHOLDER_FEED,
      affiliateMeta: { feedid: '40405' },
      providerMeta: { feedapikey: FAKE_FEEDAPIKEY },
    });
    assert.equal(r.ok, true);
    assert.equal(r.placeholdersResolved, true);
    assert.equal(
      r.fetchUrl,
      `https://productdata.example.invalid/datafeed/download/apikey/${encodeURIComponent(FAKE_FEEDAPIKEY)}/fid/40405/format/csv`,
    );
    assert.equal(r.fetchUrl.includes('{'), false);
  });

  it('returns unresolved_placeholder when provider secret missing', () => {
    const r = resolveFeedUrlForFetch({
      feedurl: PLACEHOLDER_FEED,
      affiliateMeta: { feedid: '1' },
      providerMeta: {},
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'unresolved_placeholder');
    assert.ok(r.missing.includes('feedapikey'));
    assert.equal(r.placeholdersResolved, false);
  });

  it('plain feedurl needs no substitution', () => {
    const r = resolveFeedUrlForFetch({
      feedurl: 'https://example.invalid/plain.csv',
      affiliateMeta: {},
      providerMeta: { feedapikey: FAKE_FEEDAPIKEY },
    });
    assert.equal(r.ok, true);
    assert.equal(r.placeholdersResolved, false);
    assert.equal(r.fetchUrl, 'https://example.invalid/plain.csv');
  });
});

describe('FR #4176 downloadOne placeholder fetch', () => {
  it('fetches substituted URL; marker keeps placeholder; secret never on affiliate', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/',
      Body: Buffer.alloc(0),
      Metadata: {
        name: 'Awin',
        feedapikey: FAKE_FEEDAPIKEY,
        darwinhash: FAKE_DARWIN,
      },
    });
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/1902/',
      Body: Buffer.alloc(0),
      Metadata: normalizeAffiliateMeta({
        affiliateid: '1902',
        name: 'Baker Ross',
        feedurl: PLACEHOLDER_FEED,
        feedid: '40405',
        format: 'csv',
        enabled: '1',
      }),
    });

    const fetched = [];
    const r = await downloadOne({
      s3,
      bucket: BUCKET,
      provider: 'awin',
      affiliateId: '1902',
      now: NOW,
      fetchImpl: async (url) => {
        fetched.push(String(url));
        return {
          ok: true,
          status: 200,
          body: Buffer.from('sku,price\n1,2\n', 'utf8'),
        };
      },
    });

    assert.equal(r.ok, true);
    assert.equal(r.placeholdersResolved, true);
    assert.equal(fetched.length, 1);
    assert.ok(fetched[0].includes(encodeURIComponent(FAKE_FEEDAPIKEY)));
    assert.ok(fetched[0].includes('/fid/40405/'));
    assert.equal(fetched[0].includes('{feedapikey}'), false);

    const head = await s3.headObject({ Key: 'awin/1902/' });
    assert.equal(head.Metadata.laststatus, 'ok');
    assert.ok(String(head.Metadata.feedurl).includes('{feedapikey}'));
    assert.equal(head.Metadata.feedurl.includes(FAKE_FEEDAPIKEY), false);
    assert.equal(Object.prototype.hasOwnProperty.call(head.Metadata, 'feedapikey'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(head.Metadata, 'darwinhash'), false);

    // Result + written marker must not carry secrets (fetch URL may, in memory only).
    const safeBlob = JSON.stringify({ r, meta: head.Metadata });
    assert.equal(safeBlob.includes(FAKE_FEEDAPIKEY), false);
    assert.equal(safeBlob.includes(FAKE_DARWIN), false);
  });

  it('unresolved placeholder: no fetch, laststatus unresolved_placeholder', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/',
      Body: Buffer.alloc(0),
      Metadata: { name: 'Awin' },
    });
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/1902/',
      Body: Buffer.alloc(0),
      Metadata: normalizeAffiliateMeta({
        affiliateid: '1902',
        feedurl: PLACEHOLDER_FEED,
        feedid: '40405',
        format: 'csv',
        enabled: '1',
      }),
    });

    let fetched = 0;
    const r = await downloadOne({
      s3,
      bucket: BUCKET,
      provider: 'awin',
      affiliateId: '1902',
      now: NOW,
      fetchImpl: async () => {
        fetched += 1;
        return { ok: true, status: 200, body: Buffer.from('x') };
      },
    });

    assert.equal(r.ok, false);
    assert.equal(r.status, 'unresolved_placeholder');
    assert.equal(fetched, 0);
    const head = await s3.headObject({ Key: 'awin/1902/' });
    assert.equal(head.Metadata.laststatus, 'unresolved_placeholder');
    assert.ok(String(head.Metadata.feedurl).includes('{feedapikey}'));
    assert.equal(s3.objects.has('awin/1902/parts/latest.csv'), false);
  });
});

describe('FR #4176 folderDownloadOne dryRun placeholdersResolved', () => {
  it('reports placeholdersResolved true when provider secrets present', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/',
      Body: Buffer.alloc(0),
      Metadata: { feedapikey: FAKE_FEEDAPIKEY },
    });
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/1902/',
      Body: Buffer.alloc(0),
      Metadata: {
        affiliateid: '1902',
        feedurl: PLACEHOLDER_FEED,
        feedid: '40405',
        format: 'csv',
      },
    });
    const r = await folderDownloadOne({
      s3,
      bucket: BUCKET,
      provider: 'awin',
      affiliateId: '1902',
      dryRun: true,
      now: NOW,
      fetchImpl: async () => {
        throw new Error('should_not_fetch');
      },
    });
    assert.equal(r.status, 'dry_run');
    assert.equal(r.placeholdersResolved, true);
    const red = redactResult(r);
    const text = JSON.stringify(red);
    assert.equal(red.placeholdersResolved, true);
    assert.ok(!text.includes(FAKE_FEEDAPIKEY));
    assert.ok(!text.includes('{feedapikey}'));
  });

  it('reports placeholdersResolved false when secret missing', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/1902/',
      Body: Buffer.alloc(0),
      Metadata: {
        affiliateid: '1902',
        feedurl: PLACEHOLDER_FEED,
        feedid: '40405',
        format: 'csv',
      },
    });
    const r = await folderDownloadOne({
      s3,
      bucket: BUCKET,
      provider: 'awin',
      affiliateId: '1902',
      dryRun: true,
      now: NOW,
    });
    assert.equal(r.placeholdersResolved, false);
  });
});

describe('FR #4176 runWeekly uses provider meta for placeholders', () => {
  it('downloads placeholder feedurl via provider feedapikey', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/',
      Body: Buffer.alloc(0),
      Metadata: {
        name: 'Awin',
        feedapikey: FAKE_FEEDAPIKEY,
      },
    });
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/shop1/',
      Body: Buffer.alloc(0),
      Metadata: normalizeAffiliateMeta({
        affiliateid: 'shop1',
        feedurl: PLACEHOLDER_FEED,
        feedid: '99',
        format: 'csv',
        enabled: '1',
      }),
    });

    const logs = [];
    const fetched = [];
    const summary = await runWeekly({
      s3,
      bucket: BUCKET,
      now: NOW,
      log: (m) => logs.push(String(m)),
      fetchImpl: async (url) => {
        fetched.push(String(url));
        return {
          ok: true,
          status: 200,
          body: Buffer.from('a,b\n1,2\n', 'utf8'),
        };
      },
    });

    assert.equal(summary.ok, 1);
    assert.equal(summary.failed, 0);
    assert.equal(fetched.length, 1);
    assert.ok(fetched[0].includes(encodeURIComponent(FAKE_FEEDAPIKEY)));
    const head = await s3.headObject({ Key: 'awin/shop1/' });
    assert.ok(String(head.Metadata.feedurl).includes('{feedapikey}'));
    const logBlob = logs.join('\n');
    assert.equal(logBlob.includes(FAKE_FEEDAPIKEY), false);
  });
});
