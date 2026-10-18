'use strict';

/**
 * FR #4108 / #4195: folderDownloadOne wraps downloadOne with dry-run + exists skip.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createMemoryS3 } = require('../affiliates/src/memoryS3');
const {
  folderDownloadOne,
  redactResult,
} = require('../affiliates/src/folderDownloadOne');

const NOW = new Date('2026-10-18T12:00:00.000Z');

describe('fr4108 folderDownloadOne', () => {
  it('dryRun never fetches or writes parts', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: 'a-affiliates',
      Key: 'awin/aff1/',
      Body: Buffer.alloc(0),
      Metadata: {
        feedurl: 'https://example.test/feed?key=SECRETLEAK',
        format: 'csv',
        affiliateid: 'aff1',
      },
    });
    let fetched = 0;
    const r = await folderDownloadOne({
      s3,
      bucket: 'a-affiliates',
      provider: 'awin',
      affiliateId: 'aff1',
      dryRun: true,
      now: NOW,
      fetchImpl: async () => {
        fetched += 1;
        return { ok: true, status: 200, body: Buffer.from('a,b\n1,2\n') };
      },
    });
    assert.equal(fetched, 0);
    assert.equal(r.status, 'dry_run');
    assert.equal(r.feedurlSet, true);
    assert.equal(r.datedKey, 'awin/aff1/2026-10-18.csv');
    assert.equal(r.key, 'awin/aff1/2026-10-18.csv');
    const listed = await s3.listObjectsV2({
      Bucket: 'a-affiliates',
      Prefix: 'awin/aff1/',
    });
    // marker only (zero-byte) may exist; no feed object written on dry-run
    const feeds = (listed.Contents || []).filter((c) =>
      /\/\d{4}-\d{2}-\d{2}\./.test(c.Key),
    );
    assert.equal(feeds.length, 0);
    const red = redactResult(r);
    const text = JSON.stringify(red);
    assert.ok(!text.includes('SECRETLEAK'));
    assert.ok(!text.includes('example.test'));
  });

  it('missing_feedurl returns error status without parts write', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: 'a-affiliates',
      Key: 'awin/aff2/',
      Body: Buffer.alloc(0),
      Metadata: { affiliateid: 'aff2', format: 'csv' },
    });
    const r = await folderDownloadOne({
      s3,
      bucket: 'a-affiliates',
      provider: 'awin',
      affiliateId: 'aff2',
      now: NOW,
      fetchImpl: async () => {
        throw new Error('should_not_fetch');
      },
    });
    assert.equal(r.ok, false);
    assert.equal(r.status, 'missing_feedurl');
    const listed = await s3.listObjectsV2({
      Bucket: 'a-affiliates',
      Prefix: 'awin/aff2/parts/',
    });
    assert.equal((listed.Contents || []).length, 0);
  });

  it('skips when dated feed exists unless force', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: 'a-affiliates',
      Key: 'awin/aff3/',
      Body: Buffer.alloc(0),
      Metadata: {
        feedurl: 'https://example.test/f',
        format: 'csv',
        affiliateid: 'aff3',
      },
    });
    await s3.putObject({
      Bucket: 'a-affiliates',
      Key: 'awin/aff3/2026-10-18.csv',
      Body: Buffer.from('old'),
    });
    let fetched = 0;
    const skip = await folderDownloadOne({
      s3,
      bucket: 'a-affiliates',
      provider: 'awin',
      affiliateId: 'aff3',
      now: NOW,
      fetchImpl: async () => {
        fetched += 1;
        return { ok: true, status: 200, body: Buffer.from('new') };
      },
    });
    assert.equal(skip.status, 'exists');
    assert.equal(fetched, 0);

    const forced = await folderDownloadOne({
      s3,
      bucket: 'a-affiliates',
      provider: 'awin',
      affiliateId: 'aff3',
      force: true,
      now: NOW,
      fetchImpl: async () => {
        fetched += 1;
        return { ok: true, status: 200, body: Buffer.from('newdata') };
      },
    });
    assert.equal(forced.ok, true);
    assert.equal(forced.status, 'ok');
    assert.equal(fetched, 1);
    const got = await s3.getObject({
      Bucket: 'a-affiliates',
      Key: 'awin/aff3/2026-10-18.csv',
    });
    assert.equal(got.Body.toString('utf8'), 'newdata');
  });

  it('downloads and writes one flat dated feed via downloadOne', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: 'a-affiliates',
      Key: 'awin/aff4/',
      Body: Buffer.alloc(0),
      Metadata: {
        feedurl: 'https://example.test/feed',
        format: 'csv',
        affiliateid: 'aff4',
      },
    });
    const r = await folderDownloadOne({
      s3,
      bucket: 'a-affiliates',
      provider: 'awin',
      affiliateId: 'aff4',
      now: NOW,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        body: Buffer.from('sku,name\n1,a\n'),
      }),
    });
    assert.equal(r.ok, true);
    assert.equal(r.size, Buffer.from('sku,name\n1,a\n').length);
    const dated = await s3.getObject({
      Bucket: 'a-affiliates',
      Key: 'awin/aff4/2026-10-18.csv',
    });
    assert.ok(dated.Body.length > 0);
    assert.equal(s3.objects.has('awin/aff4/parts/latest.csv'), false);
  });

  it('tools/download.ps1 shim and Invoke-FolderDownload exist', () => {
    const root = path.join(__dirname, '..');
    assert.ok(fs.existsSync(path.join(root, 'tools', 'download.ps1')));
    assert.ok(
      fs.existsSync(path.join(root, 'tools', 'Invoke-FolderDownload.ps1')),
    );
    assert.ok(fs.existsSync(path.join(root, 'tools', 'run-folder-download.js')));
  });
});
