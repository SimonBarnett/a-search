'use strict';

/**
 * FR #5269: marker rewrite must not wipe S3 object annotations
 * (annotation + steering). CopyObject AccessDenied must not PutObject-over.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const {
  setHasResults,
  clearHasResults,
  touchLastmod,
  rewriteMarkerMetadata,
} = require('../shared/widgets/hostFolderMeta');

const HOST = 'www.mymodelflyingclub.co.uk';
const GUID = '8504174c-f21f-4fe0-b8eb-98e7d7ceaed0';
const KEY = `${HOST}/${GUID}/`;

function denyCopy() {
  const err = new Error('Access is denied');
  err.name = 'AccessDenied';
  err.$metadata = { httpStatusCode: 403, requestId: 'req-5269' };
  return err;
}

/** Real S3 PutObject drops object annotations; memoryS3 does not. */
function putDroppingAnnotations(s3) {
  return async (input) => {
    const prev = s3.objects.get(input.Key);
    const out = await s3.putObject(input);
    if (prev && prev.Annotations) prev.Annotations.clear();
    const cur = s3.objects.get(input.Key);
    if (cur) cur.Annotations = new Map();
    return out;
  };
}

async function seedAnnotated(s3) {
  await s3.putObject({
    Key: KEY,
    Body: Buffer.alloc(0),
    Metadata: {
      hasresults: '0',
      enabled: '1',
      annotated: '1',
      lastmod: '2026-10-28T12:00:00.000Z',
    },
  });
  await s3.putObjectAnnotation({
    Key: KEY,
    AnnotationName: 'annotation',
    AnnotationPayload: Buffer.from('page brief', 'utf8'),
  });
  await s3.putObjectAnnotation({
    Key: KEY,
    AnnotationName: 'steering',
    AnnotationPayload: Buffer.from('steer', 'utf8'),
  });
}

async function assertAnns(s3) {
  const listed = await s3.listObjectAnnotations({ Key: KEY });
  const names = (listed.Annotations || []).map((a) => a.AnnotationName).sort();
  assert.deepEqual(names, ['annotation', 'steering']);
  const ann = await s3.getObjectAnnotation({
    Key: KEY,
    AnnotationName: 'annotation',
  });
  assert.equal(Buffer.from(ann.AnnotationPayload).toString('utf8'), 'page brief');
  const st = await s3.getObjectAnnotation({
    Key: KEY,
    AnnotationName: 'steering',
  });
  assert.equal(Buffer.from(st.AnnotationPayload).toString('utf8'), 'steer');
}

function s3Rewrite(s3, extras) {
  return {
    Key: KEY,
    bucket: 'a-clubs',
    headObject: s3.headObject,
    getObject: s3.getObject,
    getObjectTagging: async () => ({ TagSet: [] }),
    copyObject: s3.copyObject,
    putObject: putDroppingAnnotations(s3),
    putObjectTagging: async () => ({}),
    listObjectAnnotations: s3.listObjectAnnotations,
    ...(extras || {}),
  };
}

describe('FR #5269 rewrite keeps object annotations', () => {
  it('setHasResults / clearHasResults / touchLastmod leave annotation+steering', async () => {
    const s3 = createMemoryS3();
    await seedAnnotated(s3);
    const deps = s3Rewrite(s3);

    await setHasResults({ ...deps, now: '2026-10-29T07:21:37.935Z' });
    await assertAnns(s3);
    let head = await s3.headObject({ Key: KEY });
    assert.equal(String(head.Metadata.hasresults), '1');

    await clearHasResults({ ...deps, now: '2026-10-29T07:22:00.000Z' });
    await assertAnns(s3);
    head = await s3.headObject({ Key: KEY });
    assert.equal(String(head.Metadata.hasresults), '0');

    await touchLastmod({ ...deps, now: '2026-10-29T07:23:00.000Z' });
    await assertAnns(s3);
  });

  it('denied CopyObject on an annotated marker never PutObject and logs ERROR', async () => {
    const s3 = createMemoryS3();
    await seedAnnotated(s3);
    let putCalls = 0;
    /** @type {string[]} */
    const logs = [];
    await assert.rejects(
      () =>
        rewriteMarkerMetadata({
          Key: KEY,
          bucket: 'a-clubs',
          metadata: { hasresults: '1', lastmod: 't' },
          copyObject: async () => {
            throw denyCopy();
          },
          putObject: async (a) => {
            putCalls += 1;
            return putDroppingAnnotations(s3)(a);
          },
          listObjectAnnotations: s3.listObjectAnnotations,
          logError: (...args) => logs.push(args.join(' ')),
        }),
      (err) =>
        err &&
        (err.code === 'annotated_marker_copy_denied' ||
          /annotated_marker_copy_denied|AccessDenied/.test(String(err.message))),
    );
    assert.equal(putCalls, 0);
    assert.ok(
      logs.some((l) => /annotated_marker_copy_denied|PutObject/.test(l)),
      logs.join(' | '),
    );
    await assertAnns(s3);
  });

  it('CDK worker roles grant s3:PutObjectAnnotation on a-clubs', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    const start = src.indexOf('function wireAclubsInAccess');
    const end = src.indexOf('\nfunction ', start + 1);
    const block = src.slice(start, end > start ? end : start + 1800);
    assert.match(block, /s3:PutObjectAnnotation/);
    assert.match(block, /s3:GetObjectAnnotation/);
    assert.match(block, /s3:ListObjectAnnotations/);
  });
});
