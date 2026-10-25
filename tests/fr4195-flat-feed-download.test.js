'use strict';

/**
 * FR #4195: flat decompressed feed key, format-driven decompress, daily refresh.
 * FR #4931: due clock is lastdownload + shared defaultage (not refreshdays/lastok).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { createMemoryS3 } = require('../affiliates/src/memoryS3');
const { downloadOne } = require('../affiliates/src/downloadOne');
const { runDaily } = require('../affiliates/src/runDaily');
const { decompressFeedBody } = require('../affiliates/src/decompressFeed');
const {
  resolveFeedFormat,
  feedDatedKey,
} = require('../shared/affiliates/feedFormat');
const { isDueByLastDownload } = require('../shared/defaultAge');
const { normalizeAffiliateMeta } = require('../shared/affiliates/metadata');
const {
  listPendingPartsFiles,
} = require('../redqueen/affiliate-import/src/listPending');

const BUCKET = 'a-affiliates';
const NOW = new Date('2026-10-18T12:00:00.000Z');

describe('FR #4195 feedFormat', () => {
  it('resolveFeedFormat + feedDatedKey', () => {
    const ok = resolveFeedFormat(
      { format: 'tsv', compression: 'gzip' },
      {},
    );
    assert.equal(ok.ok, true);
    assert.equal(ok.ext, 'tsv');
    assert.match(ok.contentType, /tab-separated/);
    assert.equal(
      feedDatedKey('awin', '1902', '2026-10-18', 'csv'),
      'awin/1902/2026-10-18.csv',
    );
    const bad = resolveFeedFormat({ format: 'parquet' }, {});
    assert.equal(bad.ok, false);
    assert.equal(bad.status, 'unsupported_format');
  });

  it('isDueByLastDownload uses lastdownload + defaultage (FR #4931)', () => {
    assert.equal(isDueByLastDownload({}, NOW, 7), true);
    assert.equal(
      isDueByLastDownload(
        { lastdownload: '2026-10-11T12:00:00.000Z' },
        NOW,
        7,
      ),
      true,
    );
    assert.equal(
      isDueByLastDownload(
        { lastdownload: '2026-10-12T12:00:00.000Z' },
        NOW,
        7,
      ),
      false,
    );
    // lastok alone does not keep fresh when lastdownload is stale.
    assert.equal(
      isDueByLastDownload(
        {
          lastok: '2026-10-18T00:00:00.000Z',
          lastdownload: '2026-10-01T00:00:00.000Z',
        },
        NOW,
        7,
      ),
      true,
    );
  });
});

describe('FR #4195 decompress', () => {
  it('gzip and none', async () => {
    const plain = Buffer.from('a,b\n1,2\n');
    const gz = zlib.gzipSync(plain);
    const g = await decompressFeedBody(gz, { compression: 'gzip', format: 'csv' });
    assert.equal(g.ok, true);
    assert.deepEqual(g.buffer, plain);
    const n = await decompressFeedBody(plain, { compression: 'none', format: 'csv' });
    assert.equal(n.ok, true);
    const bad = await decompressFeedBody(Buffer.from('not-gzip'), {
      compression: 'gzip',
      format: 'csv',
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.status, 'decompress_error');
  });

  it('zip stored entry matching format', async () => {
    const plain = Buffer.from('x,y\n9,8\n');
    const name = Buffer.from('feed.csv');
    const local = Buffer.alloc(30 + name.length + plain.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(plain.length, 18);
    local.writeUInt32LE(plain.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    plain.copy(local, 30 + name.length);

    const cd = Buffer.alloc(46 + name.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 10); // stored
    cd.writeUInt32LE(plain.length, 20);
    cd.writeUInt32LE(plain.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(0, 42); // local offset
    name.copy(cd, 46);

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(cd.length, 12);
    eocd.writeUInt32LE(local.length, 16);

    const zip = Buffer.concat([local, cd, eocd]);
    const r = await decompressFeedBody(zip, { compression: 'zip', format: 'csv' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.buffer, plain);
  });
});

describe('FR #4195 downloadOne statuses', () => {
  it('unsupported_format writes nothing', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/x/',
      Body: Buffer.alloc(0),
      Metadata: normalizeAffiliateMeta({
        affiliateid: 'x',
        feedurl: 'https://example.test/f',
        format: 'csv',
        enabled: '1',
      }),
    });
    // Force unsupported via provider override trick: patch meta after normalize
    const head = await s3.headObject({ Key: 'awin/x/' });
    const meta = { ...head.Metadata, format: 'parquet' };
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/x/',
      Body: Buffer.alloc(0),
      Metadata: meta,
    });
    let fetched = 0;
    const r = await downloadOne({
      s3,
      bucket: BUCKET,
      provider: 'awin',
      affiliateId: 'x',
      now: NOW,
      fetchImpl: async () => {
        fetched += 1;
        return { ok: true, status: 200, body: Buffer.from('x') };
      },
    });
    assert.equal(r.status, 'unsupported_format');
    assert.equal(fetched, 0);
    assert.equal(s3.objects.has('awin/x/2026-10-18.csv'), false);
  });

  it('exists skip does not fetch', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/y/',
      Body: Buffer.alloc(0),
      Metadata: normalizeAffiliateMeta({
        affiliateid: 'y',
        feedurl: 'https://example.test/f',
        format: 'csv',
        enabled: '1',
      }),
    });
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/y/2026-10-18.csv',
      Body: Buffer.from('old'),
    });
    let fetched = 0;
    const r = await downloadOne({
      s3,
      bucket: BUCKET,
      provider: 'awin',
      affiliateId: 'y',
      now: NOW,
      fetchImpl: async () => {
        fetched += 1;
        return { ok: true, status: 200, body: Buffer.from('new') };
      },
    });
    assert.equal(r.status, 'exists');
    assert.equal(fetched, 0);
  });
});

describe('FR #4195 runDaily refresh window', () => {
  it('skips fresh lastdownload; downloads stale and never; failure keeps lastok', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: BUCKET,
      Key: '_root/',
      Body: Buffer.alloc(0),
      Metadata: { defaultage: '7' },
    });
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/',
      Body: Buffer.alloc(0),
      Metadata: { name: 'Awin', enabled: '1' },
    });
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/fresh/',
      Body: Buffer.alloc(0),
      Metadata: normalizeAffiliateMeta({
        affiliateid: 'fresh',
        feedurl: 'https://example.test/fresh.csv',
        format: 'csv',
        enabled: '1',
        lastdownload: '2026-10-12T12:00:00.000Z',
        lastok: '2026-10-12T12:00:00.000Z',
        laststatus: 'ok',
      }),
    });
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/stale/',
      Body: Buffer.alloc(0),
      Metadata: normalizeAffiliateMeta({
        affiliateid: 'stale',
        feedurl: 'https://example.test/stale.csv',
        format: 'csv',
        enabled: '1',
        lastdownload: '2026-10-11T12:00:00.000Z',
        lastok: '2026-10-11T12:00:00.000Z',
        laststatus: 'ok',
      }),
    });
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/never/',
      Body: Buffer.alloc(0),
      Metadata: normalizeAffiliateMeta({
        affiliateid: 'never',
        feedurl: 'https://example.test/never.csv',
        format: 'csv',
        enabled: '1',
      }),
    });
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/failing/',
      Body: Buffer.alloc(0),
      Metadata: normalizeAffiliateMeta({
        affiliateid: 'failing',
        feedurl: 'https://example.test/fail.csv',
        format: 'csv',
        enabled: '1',
        lastdownload: '2026-10-01T00:00:00.000Z',
        lastok: '2026-10-01T00:00:00.000Z',
        laststatus: 'ok',
      }),
    });

    const summary = await runDaily({
      s3,
      bucket: BUCKET,
      now: NOW,
      log: () => {},
      fetchImpl: async (url) => {
        if (String(url).includes('fail')) {
          return { ok: false, status: 500 };
        }
        return {
          ok: true,
          status: 200,
          body: Buffer.from('a,b\n1,2\n'),
        };
      },
    });

    assert.ok(summary.skippedFresh >= 1);
    assert.ok(s3.objects.has('awin/stale/2026-10-18.csv'));
    assert.ok(s3.objects.has('awin/never/2026-10-18.csv'));
    assert.equal(s3.objects.has('awin/fresh/2026-10-18.csv'), false);
    const failHead = await s3.headObject({ Key: 'awin/failing/' });
    assert.equal(failHead.Metadata.lastok, '2026-10-01T00:00:00.000Z');
    assert.equal(failHead.Metadata.laststatus, 'http_500');
  });

  it('provider enabled=0 skips all affiliates', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'dark/',
      Body: Buffer.alloc(0),
      Metadata: { enabled: '0' },
    });
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'dark/a1/',
      Body: Buffer.alloc(0),
      Metadata: normalizeAffiliateMeta({
        affiliateid: 'a1',
        feedurl: 'https://example.test/a.csv',
        format: 'csv',
        enabled: '1',
      }),
    });
    let fetched = 0;
    const summary = await runDaily({
      s3,
      bucket: BUCKET,
      now: NOW,
      log: () => {},
      fetchImpl: async () => {
        fetched += 1;
        return { ok: true, status: 200, body: Buffer.from('x') };
      },
    });
    assert.equal(fetched, 0);
    assert.equal(summary.skippedDisabled, 1);
  });
});

describe('FR #4195 listPending flat keys', () => {
  it('lists flat dated feeds and legacy parts', async () => {
    const keys = [];
    const listObjectsV2 = async () => ({
      Contents: [
        { Key: 'awin/1902/2026-10-18.csv' },
        { Key: 'awin/1902/parts/2026-10-17.csv.gz' },
        { Key: 'awin/1902/parts/latest.csv.gz' },
        { Key: 'awin/1902/' },
      ],
    });
    const pending = await listPendingPartsFiles({ listObjectsV2, bucket: BUCKET });
    assert.equal(pending.length, 2);
    assert.equal(pending[0].key, 'awin/1902/parts/2026-10-17.csv.gz');
    assert.equal(pending[1].key, 'awin/1902/2026-10-18.csv');
    void keys;
  });
});
