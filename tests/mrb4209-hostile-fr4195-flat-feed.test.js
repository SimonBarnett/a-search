'use strict';

/**
 * MRB #4209 hostile pins for FR #4195 flat decompressed feed download.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createMemoryS3 } = require('../affiliates/src/memoryS3');
const { downloadOne } = require('../affiliates/src/downloadOne');
const { feedDatedKey } = require('../shared/affiliates/feedFormat');

const BUCKET = 'a-affiliates';
const NOW = new Date('2026-10-18T12:00:00.000Z');

describe('MRB #4209 hostile FR #4195', () => {
  it('downloadOne writes flat key only; no parts/ or latest objects', async () => {
    const plain = Buffer.from('a,b\n1,2\n');
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/1902/',
      Body: Buffer.alloc(0),
      Metadata: {
        feedurl: 'https://example.test/f',
        format: 'csv',
        compression: 'gzip',
        affiliateid: '1902',
      },
    });
    const r = await downloadOne({
      s3,
      bucket: BUCKET,
      provider: 'awin',
      affiliateId: '1902',
      now: NOW,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        body: zlib.gzipSync(plain),
      }),
    });
    assert.equal(r.ok, true);
    assert.equal(r.datedKey, 'awin/1902/2026-10-18.csv');
    const listed = await s3.listObjectsV2({ Bucket: BUCKET, Prefix: 'awin/1902/' });
    const keys = (listed.Contents || []).map((c) => c.Key).sort();
    assert.ok(keys.includes('awin/1902/'));
    assert.ok(keys.includes('awin/1902/2026-10-18.csv'));
    assert.equal(keys.some((k) => k.includes('/parts/')), false);
    assert.equal(keys.some((k) => /\/latest\./.test(k)), false);
    const head = await s3.headObject({
      Bucket: BUCKET,
      Key: 'awin/1902/',
    });
    assert.ok(head.Metadata.lastok);
    assert.equal(String(head.Metadata.lastsize), String(plain.length));
  });

  it('CDK daily rule is rate(1 day); handler points at runDaily', () => {
    const root = path.join(__dirname, '..');
    const stack = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'affiliates-stack.js'),
      'utf8',
    );
    const handler = fs.readFileSync(
      path.join(root, 'affiliates', 'src', 'handler.js'),
      'utf8',
    );
    assert.match(stack, /rate\(1 day\)/);
    assert.match(handler, /runDaily/);
    assert.equal(/parts\/latest/.test(
      fs.readFileSync(path.join(root, 'affiliates', 'src', 'downloadOne.js'), 'utf8'),
    ), false);
  });

  it('feedDatedKey never nests parts/', () => {
    assert.equal(
      feedDatedKey('awin', '1902', '2026-10-18', 'csv'),
      'awin/1902/2026-10-18.csv',
    );
    assert.ok(!feedDatedKey('awin', '1', '2026-10-18', 'tsv').includes('parts'));
  });
});
