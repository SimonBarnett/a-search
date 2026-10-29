'use strict';

/**
 * FR #5275: wire listObjectAnnotations through DONE / hasresults S3 deps so
 * CopyObject AccessDenied + empty Annotations still Put-fallbacks (FR #5255).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { recordSearchTerminal } = require('../shared/search/searchDone');
const { resolveDoneS3Deps } = require('../shared/search/handleSqsWith429');
const { attachDefaultS3 } = require('../shared/search/liveWorkerS3');

const ROOT = path.join(__dirname, '..');
const HOST = 'www.mymodelflyingclub.co.uk';
const GUID = '8504174c-f21f-4fe0-b8eb-98e7d7ceaed0';
const SEARCHID = 'srch_5275_list_ann';

describe('FR #5275 listObjectAnnotations on DONE / hasresults path', () => {
  it('source pins DONE writers pass listObjectAnnotations', () => {
    const writeLive = fs.readFileSync(
      path.join(ROOT, 'shared/search/writeLiveProviderInResult.js'),
      'utf8',
    );
    assert.match(writeLive, /listObjectAnnotations: s3Fns\.listObjectAnnotations/);
    assert.match(writeLive, /listObjectAnnotations: withBucket\(opts\.listObjectAnnotations\)/);
    const handle = fs.readFileSync(
      path.join(ROOT, 'shared/search/handleSqsWith429.js'),
      'utf8',
    );
    assert.match(handle, /listObjectAnnotations: args\.listObjectAnnotations/);
    assert.match(handle, /listObjectAnnotations: withDoneBucket\(listObjectAnnotations, bucket\)/);
    const liveS3 = fs.readFileSync(
      path.join(ROOT, 'shared/search/liveWorkerS3.js'),
      'utf8',
    );
    assert.match(liveS3, /FR #5275/);
    assert.match(liveS3, /AWS_REGION|createS3Client/);
  });

  it('resolveDoneS3Deps wraps injected listObjectAnnotations with Bucket', async () => {
    const seen = [];
    const deps = resolveDoneS3Deps({
      putObject: async () => ({}),
      getObject: async () => ({ Body: Buffer.alloc(0), Metadata: {} }),
      headObject: async () => ({ Metadata: {} }),
      copyObject: async () => ({}),
      getObjectTagging: async () => ({ TagSet: [] }),
      putObjectTagging: async () => ({}),
      listObjectAnnotations: async (a) => {
        seen.push(a);
        return { Annotations: [] };
      },
      envVars: { A_CLUBS_BUCKET: 'a-clubs-5275' },
    });
    assert.equal(typeof deps.listObjectAnnotations, 'function');
    await deps.listObjectAnnotations({ Key: `${HOST}/${GUID}/` });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].Bucket, 'a-clubs-5275');
    assert.equal(seen[0].Key, `${HOST}/${GUID}/`);
  });

  it('AccessDenied + empty Annotations via recordSearchTerminal still Put-flips', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Key: `${HOST}/${GUID}/`,
      Body: Buffer.alloc(0),
      Metadata: { hasresults: '0', annotated: '1', lastmod: 't' },
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/search-fanout.json`,
      Body: `${JSON.stringify({ searchid: SEARCHID, queued: ['ebay'], at: 't' })}\n`,
    });
    let listCalls = 0;
    let putOnMarker = 0;
    const markerKey = `${HOST}/${GUID}/`;
    const flip = await recordSearchTerminal({
      bucket: 'a-clubs',
      putObject: async (a) => {
        if (a && a.Key === markerKey) putOnMarker += 1;
        return s3.putObject(a);
      },
      getObject: s3.getObject,
      headObject: s3.headObject,
      copyObject: async () => {
        const err = new Error('AccessDenied');
        err.name = 'AccessDenied';
        err.$metadata = { httpStatusCode: 403, requestId: 'req-5275' };
        throw err;
      },
      getObjectTagging: async () => ({ TagSet: [] }),
      putObjectTagging: async () => ({}),
      listObjectAnnotations: async () => {
        listCalls += 1;
        return { Annotations: [] };
      },
      listObjectsV2: s3.listObjectsV2,
      recheckDelayMs: 0,
      sleep: async () => {},
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'ebay',
      status: 'serviced',
      products: 2,
    });
    assert.equal(flip.hasresults, true);
    assert.ok(listCalls >= 1, 'listObjectAnnotations must run before Put fallback');
    assert.ok(putOnMarker >= 1, 'expected PutObject fallback on GUID marker');
    const head = await s3.headObject({ Key: markerKey });
    assert.equal(String(head.Metadata.hasresults), '1');
  });

  it('attachDefaultS3 fills listObjectAnnotations when putObject + createS3Client', () => {
    const injected = {
      putObject: async () => ({}),
      createS3Client: () => ({ send: async () => ({ Annotations: [] }) }),
    };
    const out = attachDefaultS3(injected);
    assert.equal(out, injected);
    assert.equal(typeof injected.listObjectAnnotations, 'function');
  });

  it('attachDefaultS3 does not attach SDK list when only putObject is injected', () => {
    const injected = { putObject: async () => ({}) };
    attachDefaultS3(injected);
    assert.equal(typeof injected.listObjectAnnotations, 'undefined');
  });
});
