'use strict';

/**
 * FR #5255: hasresults=1 when last provider is DLQ'd (bucket on DLQ path) or
 * when marker CopyObject hits AccessDenied (log + retry + PutObject fallback).
 * Never writes under host/guid/DONE/.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const {
  recordSearchTerminal,
  maybeSetHasResults,
} = require('../shared/search/searchDone');
const {
  resolveDoneS3Deps,
  recordDlqDone,
  moveMessageToDlq,
} = require('../shared/search/handleSqsWith429');
const {
  setHasResults,
  rewriteMarkerMetadata,
  formatS3Error,
} = require('../shared/widgets/hostFolderMeta');

const HOST = 'www.mymodelflyingclub.co.uk';
const GUID = '8504174c-f21f-4fe0-b8eb-98e7d7ceaed0';
const SEARCHID = 'srch_5255_hasresults';

function s3Deps(s3, extras) {
  return {
    bucket: 'a-clubs',
    putObject: s3.putObject,
    getObject: s3.getObject,
    headObject: s3.headObject,
    copyObject: s3.copyObject,
    getObjectTagging: async () => ({ TagSet: [] }),
    putObjectTagging: async () => ({}),
    listObjectsV2: s3.listObjectsV2,
    recheckDelayMs: 0,
    sleep: async () => {},
    ...(extras || {}),
  };
}

async function seedFanout(s3, queued) {
  await s3.putObject({
    Key: `${HOST}/${GUID}/`,
    Body: Buffer.alloc(0),
    Metadata: {
      hasresults: '0',
      enabled: '0',
      annotated: '1',
      lastmod: '2026-10-27T10:37:00.000Z',
    },
  });
  await s3.putObject({
    Key: `${HOST}/${GUID}/live.json`,
    Body: '[]\n',
  });
  await s3.putObject({
    Key: `${HOST}/${GUID}/search-fanout.json`,
    Body: `${JSON.stringify({ searchid: SEARCHID, queued, at: 't' })}\n`,
  });
}

describe('FR #5255 hasresults DLQ bucket + AccessDenied retry', () => {
  /** @type {ReturnType<typeof createMemoryS3>} */
  let s3;

  beforeEach(() => {
    s3 = createMemoryS3();
  });

  it('resolveDoneS3Deps returns bucket and injects Bucket on Key-only S3 calls', async () => {
    /** @type {Array<{op: string, Bucket?: string}>} */
    const calls = [];
    const raw = {
      putObject: async (a) => {
        calls.push({ op: 'putObject', Bucket: a.Bucket });
        return {};
      },
      headObject: async (a) => {
        calls.push({ op: 'headObject', Bucket: a.Bucket });
        if (!a.Bucket) {
          throw new Error('No value provided for input HTTP label: Bucket.');
        }
        return { Metadata: { hasresults: '0' } };
      },
      getObject: async (a) => {
        calls.push({ op: 'getObject', Bucket: a.Bucket });
        if (!a.Bucket) {
          throw new Error('No value provided for input HTTP label: Bucket.');
        }
        return { Body: Buffer.alloc(0), Metadata: {} };
      },
      copyObject: async (a) => {
        calls.push({ op: 'copyObject', Bucket: a.Bucket });
        if (!a.Bucket) {
          throw new Error('No value provided for input HTTP label: Bucket.');
        }
        return {};
      },
      getObjectTagging: async (a) => {
        calls.push({ op: 'getObjectTagging', Bucket: a.Bucket });
        return { TagSet: [] };
      },
      putObjectTagging: async (a) => {
        calls.push({ op: 'putObjectTagging', Bucket: a.Bucket });
        return {};
      },
    };
    const deps = resolveDoneS3Deps({
      ...raw,
      envVars: { A_CLUBS_BUCKET: 'a-clubs-5255' },
    });
    assert.equal(deps.bucket, 'a-clubs-5255');
    await deps.headObject({ Key: `${HOST}/${GUID}/` });
    await deps.copyObject({
      Key: `${HOST}/${GUID}/`,
      CopySource: `a-clubs-5255/${HOST}/${GUID}/`,
      MetadataDirective: 'REPLACE',
      Metadata: { hasresults: '1' },
    });
    const missing = calls.filter((c) => !c.Bucket);
    assert.deepEqual(missing, [], `Bucket missing on ${JSON.stringify(missing)}`);
    for (const c of calls) {
      assert.equal(c.Bucket, 'a-clubs-5255', c.op);
    }
  });

  it('DLQ-last provider still flips hasresults=1 (bucket on DLQ terminal path)', async () => {
    await seedFanout(s3, ['amazon', 'sql', 'ebay', 'rakuten']);
    const deps = s3Deps(s3);
    const errors = [];

    await recordSearchTerminal({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'sql',
      status: 'serviced',
      products: 0,
    });
    await recordSearchTerminal({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'rakuten',
      status: 'serviced',
      products: 0,
    });
    await recordSearchTerminal({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'ebay',
      status: 'serviced',
      products: 4,
    });

    // Last writer is DLQ'd amazon — must pass bucket (via resolveDoneS3Deps / recordDlqDone).
    const rawPut = async (a) => {
      if (!a.Bucket) {
        throw new Error('No value provided for input HTTP label: Bucket.');
      }
      return s3.putObject(a);
    };
    const rawHead = async (a) => {
      if (!a.Bucket) {
        throw new Error('No value provided for input HTTP label: Bucket.');
      }
      return s3.headObject(a);
    };
    const rawGet = async (a) => {
      if (!a.Bucket) {
        throw new Error('No value provided for input HTTP label: Bucket.');
      }
      return s3.getObject(a);
    };
    const rawCopy = async (a) => {
      if (!a.Bucket) {
        throw new Error('No value provided for input HTTP label: Bucket.');
      }
      return s3.copyObject(a);
    };
    const s3Wrapped = resolveDoneS3Deps({
      putObject: rawPut,
      getObject: rawGet,
      headObject: rawHead,
      copyObject: rawCopy,
      getObjectTagging: async () => ({ TagSet: [] }),
      putObjectTagging: async () => ({}),
      envVars: { A_CLUBS_BUCKET: 'a-clubs' },
    });
    const msg = {
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'amazon',
    };
    const flip = await recordDlqDone({
      ...s3Wrapped,
      msg,
      source: 'amazon',
      logError: (...args) => errors.push(args.join(' ')),
      recheckDelayMs: 0,
      sleep: async () => {},
      listObjectsV2: s3.listObjectsV2,
    });
    assert.ok(flip);
    assert.equal(flip.hasresults, true);
    const head = await s3.headObject({ Key: `${HOST}/${GUID}/` });
    assert.equal(String(head.Metadata.hasresults), '1');
    // FR #5198: no GUID DONE/ folder.
    let sawGuidDone = false;
    try {
      await s3.headObject({
        Key: `${HOST}/${GUID}/DONE/${SEARCHID}-amazon.json`,
      });
      sawGuidDone = true;
    } catch {
      sawGuidDone = false;
    }
    assert.equal(sawGuidDone, false);
    const done = await s3.getObject({
      Key: `_search-done/${SEARCHID}/amazon.json`,
    });
    assert.ok(done);
  });

  it('live-last provider flips hasresults=1', async () => {
    await seedFanout(s3, ['amazon', 'ebay']);
    const deps = s3Deps(s3);

    let flip = await recordSearchTerminal({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'amazon',
      status: 'dlq',
      products: 0,
    });
    assert.equal(flip.hasresults, false);

    flip = await recordSearchTerminal({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'ebay',
      status: 'serviced',
      products: 4,
    });
    assert.equal(flip.hasresults, true);
    const head = await s3.headObject({ Key: `${HOST}/${GUID}/` });
    assert.equal(String(head.Metadata.hasresults), '1');
  });

  it('marker update fails once then retries to hasresults=1', async () => {
    await seedFanout(s3, ['ebay']);
    const errors = [];
    let markerHeadFails = 0;
    const markerKey = `${HOST}/${GUID}/`;
    const flip = await recordSearchTerminal({
      ...s3Deps(s3, {
        // Fail only on the GUID marker head (setHasResults), not _search-done heads.
        headObject: async (a) => {
          if (a && a.Key === markerKey && markerHeadFails < 1) {
            markerHeadFails += 1;
            const err = new Error('AccessDenied');
            err.name = 'AccessDenied';
            err.$metadata = {
              httpStatusCode: 403,
              requestId: 'req-5255-retry',
            };
            throw err;
          }
          return s3.headObject(a);
        },
        logError: (...args) => errors.push(args.join(' ')),
        hasResultsMaxAttempts: 3,
        hasResultsRetryDelayMs: 0,
      }),
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'ebay',
      status: 'serviced',
      products: 1,
    });
    assert.equal(flip.hasresults, true);
    assert.equal(markerHeadFails, 1);
    assert.ok(
      errors.some((e) => /set_hasresults_failed/.test(e)),
      'expected ERROR set_hasresults_failed',
    );
    assert.ok(
      errors.some((e) => /AccessDenied/.test(e) && /requestId=req-5255-retry/.test(e)),
      `full S3 ERROR fields missing: ${errors.join(' | ')}`,
    );
    const head = await s3.headObject({ Key: markerKey });
    assert.equal(String(head.Metadata.hasresults), '1');
  });

  it('CopyObject AccessDenied falls back to PutObject and still sets hasresults', async () => {
    await s3.putObject({
      Key: `${HOST}/${GUID}/`,
      Body: Buffer.alloc(0),
      Metadata: { hasresults: '0', annotated: '1', lastmod: 't' },
    });
    let putCalls = 0;
    const out = await setHasResults({
      Key: `${HOST}/${GUID}/`,
      bucket: 'a-clubs',
      now: '2026-10-28T12:00:00.000Z',
      headObject: s3.headObject,
      getObject: s3.getObject,
      getObjectTagging: async () => ({ TagSet: [] }),
      copyObject: async () => {
        const err = new Error('Access is denied');
        err.name = 'AccessDenied';
        err.$metadata = { httpStatusCode: 403, requestId: 'req-put-fallback' };
        throw err;
      },
      putObject: async (a) => {
        putCalls += 1;
        assert.equal(a.Bucket, 'a-clubs');
        return s3.putObject(a);
      },
      putObjectTagging: async () => ({}),
      listObjectAnnotations: async () => ({ Annotations: [] }),
      maxAttempts: 1,
      retryDelayMs: 0,
      logError: () => {},
    });
    assert.equal(out.hasresults, 1);
    assert.equal(out.via, 'put');
    assert.equal(putCalls, 1);
    const head = await s3.headObject({ Key: `${HOST}/${GUID}/` });
    assert.equal(String(head.Metadata.hasresults), '1');
  });

  it('rewriteMarkerMetadata passes destination Bucket on CopyObject', async () => {
    /** @type {object|null} */
    let copied = null;
    await rewriteMarkerMetadata({
      Key: `${HOST}/${GUID}/`,
      bucket: 'a-clubs-dest',
      metadata: { hasresults: '1' },
      copyObject: async (args) => {
        copied = args;
        return { ETag: '"abc"' };
      },
    });
    assert.ok(copied);
    assert.equal(copied.Bucket, 'a-clubs-dest');
    assert.match(String(copied.CopySource), /^a-clubs-dest\//);
  });

  it('formatS3Error includes code message requestId bucket key', () => {
    const err = new Error('Access is denied');
    err.name = 'AccessDenied';
    err.$metadata = { httpStatusCode: 403, requestId: 'rid-1' };
    const s = formatS3Error(err, {
      bucket: 'a-clubs',
      Key: `${HOST}/${GUID}/`,
    });
    assert.match(s, /code=AccessDenied/);
    assert.match(s, /message=Access is denied/);
    assert.match(s, /requestId=rid-1/);
    assert.match(s, /bucket=a-clubs/);
    assert.match(s, /key=www\.mymodelflyingclub\.co\.uk\/8504174c/);
  });

  it('moveMessageToDlq with resolveDoneS3Deps completes hasresults on sole queued source', async () => {
    await seedFanout(s3, ['amazon']);
    const msg = {
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'amazon',
    };
    const raw = {
      putObject: async (a) => {
        if (!a.Bucket) {
          throw new Error('No value provided for input HTTP label: Bucket.');
        }
        return s3.putObject(a);
      },
      getObject: async (a) => {
        if (!a.Bucket) {
          throw new Error('No value provided for input HTTP label: Bucket.');
        }
        return s3.getObject(a);
      },
      headObject: async (a) => {
        if (!a.Bucket) {
          throw new Error('No value provided for input HTTP label: Bucket.');
        }
        return s3.headObject(a);
      },
      copyObject: async (a) => {
        if (!a.Bucket) {
          throw new Error('No value provided for input HTTP label: Bucket.');
        }
        return s3.copyObject(a);
      },
    };
    const s3Wrapped = resolveDoneS3Deps({
      ...raw,
      getObjectTagging: async () => ({ TagSet: [] }),
      putObjectTagging: async () => ({}),
      envVars: { A_CLUBS_BUCKET: 'a-clubs' },
    });
    await moveMessageToDlq({
      record: {
        body: JSON.stringify(msg),
        receiptHandle: 'rh',
        attributes: { MessageGroupId: 'amazon', ApproximateReceiveCount: '1' },
      },
      err: Object.assign(new Error('AssociateNotEligible'), {
        code: 'creators_not_eligible',
        nonRetryable: true,
      }),
      msg,
      source: 'amazon',
      sendMessage: async () => {},
      deleteMessage: async () => {},
      queueUrl: 'https://sqs/q',
      dlqUrl: 'https://sqs/dlq',
      ...s3Wrapped,
      listObjectsV2: s3.listObjectsV2,
      recheckDelayMs: 0,
      sleep: async () => {},
      fetch: async () => ({ ok: true, status: 200, text: async () => '' }),
    });
    const head = await s3.headObject({ Key: `${HOST}/${GUID}/` });
    assert.equal(String(head.Metadata.hasresults), '1');
    // sanity: maybeSetHasResults stays true
    const again = await maybeSetHasResults({
      ...s3Deps(s3),
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
    });
    assert.equal(again.hasresults, true);
  });
});
