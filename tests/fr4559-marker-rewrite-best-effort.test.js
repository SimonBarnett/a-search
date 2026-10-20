'use strict';

/**
 * FR #4559: after IN/ is written, marker metadata/lastmod rewrite must be
 * best-effort. A simulated 403 on CopyObject must not throw (no DLQ).
 * rewrite must preserve annotated=1 when head returns it.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { writeInResultToS3 } = require('../shared/search/writeInResultS3');
const { touchLastmod } = require('../shared/widgets/hostFolderMeta');

describe('FR #4559 marker rewrite best-effort after IN write', () => {
  it('403 on touchLastmod still leaves IN written and does not throw', async () => {
    /** @type {string[]} */
    const putKeys = [];
    /** @type {string[]} */
    const warns = [];
    const err = new Error('AccessDenied');
    err.name = 'AccessDenied';
    err.$metadata = { httpStatusCode: 403 };

    const out = await writeInResultToS3({
      hostkey: 'www.mymodelflyingclub.co.uk',
      guid: 'de986521-72d8-4d55-8da3-12ca524d8d74',
      searchid: 'srch_677ea35b21e320ef2f63',
      source: 'ebay',
      products: [{ id: '1' }, { id: '2' }],
      putObject: async (args) => {
        putKeys.push(args.Key);
      },
      touchLastmod: async () => {
        throw err;
      },
      log: (m) => warns.push(String(m)),
    });

    assert.match(out.Key, /IN\/srch_677ea35b21e320ef2f63-ebay\.json$/);
    assert.equal(putKeys.length, 1);
    assert.equal(putKeys[0], out.Key);
    assert.ok(warns.length >= 1);
    assert.match(warns[0], /touchLastmod_best_effort_failed/);
    assert.match(warns[0], /AccessDenied/);
  });

  it('touchLastmod preserves annotated=1 and copies tags', async () => {
    /** @type {object|null} */
    let copied = null;
    await touchLastmod({
      Key: 'host.example/guid-1/',
      bucket: 'a-clubs',
      now: new Date('2026-10-20T16:00:00.000Z'),
      headObject: async () => ({
        Metadata: { annotated: '1', other: 'keep' },
      }),
      getObjectTagging: async () => ({
        TagSet: [{ Key: 'env', Value: 'live' }],
      }),
      copyObject: async (args) => {
        copied = args;
      },
    });
    assert.ok(copied);
    assert.equal(copied.Metadata.annotated, '1');
    assert.equal(copied.Metadata.other, 'keep');
    assert.ok(copied.Metadata.lastmod);
    assert.equal(copied.MetadataDirective, 'REPLACE');
    assert.equal(copied.TaggingDirective, 'COPY');
  });

  it('wireAclubsInAccess grants Get/List ObjectAnnotation for annotated markers', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    const start = src.indexOf('function wireAclubsInAccess');
    assert.ok(start >= 0);
    const end = src.indexOf('\nfunction ', start + 1);
    const block = end > start ? src.slice(start, end) : src.slice(start, start + 1600);
    assert.match(block, /s3:GetObjectAnnotation/);
    assert.match(block, /s3:ListObjectAnnotations/);
    assert.doesNotMatch(block, /s3:PutObjectAnnotation/);
    assert.doesNotMatch(block, /s3:DeleteObjectAnnotation/);
  });
});
