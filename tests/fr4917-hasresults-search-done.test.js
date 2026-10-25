'use strict';

/**
 * FR #4917: hasresults=0 on new GUID markers; DONE/{searchid}-{source}.json terminal
 * records; flip hasresults=1 when every fan-out source is serviced or dlq'd.
 * Zero-product finishes still write DONE (FR #4823: still no IN/).
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { ensureAclubsHost } = require('../parts-gateway/src/ensureHost');
const { ensureAclubsWidget } = require('../parts-gateway/src/ensureWidget');
const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { isExcludedKey } = require('../shared/aClubs/changeEvents');
const {
  writeLiveProviderInResult,
} = require('../shared/search/writeLiveProviderInResult');
const {
  doneObjectKey,
  writeSearchDoneRecord,
  maybeSetHasResults,
  recordSearchTerminal,
} = require('../shared/search/searchDone');
const { setHasResults } = require('../shared/widgets/hostFolderMeta');
const { moveMessageToDlq } = require('../shared/search/handleSqsWith429');

const HOST = 'www.example-club.test';
const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SEARCHID = 'srch_4917_mix';

describe('FR #4917 hasresults + DONE terminal records', () => {
  /** @type {ReturnType<typeof createMemoryS3>} */
  let s3;

  beforeEach(() => {
    s3 = createMemoryS3();
  });

  it('ensureAclubsWidget creates GUID markers with hasresults=0 (and enabled=0)', async () => {
    const host = await ensureAclubsHost({
      host: HOST,
      headObject: s3.headObject,
      putObject: s3.putObject,
      putObjectTagging: s3.putObjectTagging,
    });
    const out = await ensureAclubsWidget({
      host: HOST,
      widgetGuid: GUID,
      userid: host.userid,
      putObject: s3.putObject,
      headObject: s3.headObject,
      getObject: s3.getObject,
      copyObject: s3.copyObject,
      getObjectTagging: s3.getObjectTagging,
      putObjectTagging: s3.putObjectTagging,
      now: '2026-10-25T12:00:00.000Z',
    });
    assert.equal(out.created, true);
    const md = out.metadata || {};
    assert.equal(String(md.hasresults), '0');
    assert.equal(String(md.enabled), '0');
  });

  it('DONE/ keys are excluded from annotation change events', () => {
    assert.equal(
      isExcludedKey(`${HOST}/${GUID}/DONE/${SEARCHID}-amazon.json`),
      true,
    );
    assert.equal(isExcludedKey(`${HOST}/${GUID}/done/x.json`), true);
    assert.equal(isExcludedKey(`${HOST}/${GUID}/widget.json`), false);
  });

  it('doneObjectKey shape matches host/guid/DONE/searchid-source.json', () => {
    assert.equal(
      doneObjectKey(HOST, GUID, SEARCHID, 'Amazon'),
      `${HOST}/${GUID}/DONE/${SEARCHID}-amazon.json`,
    );
  });

  it('zero products still writes DONE serviced and never IN/', async () => {
    const puts = [];
    const putObject = async (args) => {
      puts.push(args);
      return s3.putObject(args);
    };
    await s3.putObject({
      Key: `${HOST}/${GUID}/search-fanout.json`,
      Body: JSON.stringify({ searchid: SEARCHID, queued: ['cj'], at: 't' }),
    });
    // Seed marker so setHasResults can rewrite.
    await s3.putObject({
      Key: `${HOST}/${GUID}/`,
      Body: Buffer.alloc(0),
      Metadata: {
        hasresults: '0',
        enabled: '0',
        annotated: '0',
        lastmod: '2026-10-25T12:00:00.000Z',
      },
    });

    const out = await writeLiveProviderInResult({
      msg: { hostkey: HOST, guid: GUID, searchid: SEARCHID, env: 'sandbox' },
      source: 'cj',
      products: [],
      envVars: { A_CLUBS_BUCKET: 'test-a-clubs' },
      putObject,
      headObject: s3.headObject,
      getObject: s3.getObject,
      copyObject: s3.copyObject,
      getObjectTagging: async () => ({ TagSet: [] }),
      putObjectTagging: async () => ({}),
    });
    assert.equal(out.skipped, 'no_products');
    assert.equal(out.key, null);
    const doneKeys = puts
      .map((p) => String(p.Key || ''))
      .filter((k) => k.includes('/DONE/'));
    assert.ok(doneKeys.some((k) => k.endsWith(`${SEARCHID}-cj.json`)));
    const inKeys = puts
      .map((p) => String(p.Key || ''))
      .filter((k) => /\/IN\//i.test(k));
    assert.equal(inKeys.length, 0);
  });

  it('mixed serviced + dlq flips hasresults=1 only after the last terminal record', async () => {
    await s3.putObject({
      Key: `${HOST}/${GUID}/`,
      Body: Buffer.alloc(0),
      Metadata: {
        hasresults: '0',
        enabled: '0',
        annotated: '0',
        lastmod: '2026-10-25T12:00:00.000Z',
      },
    });
    // Seed empty live.json so promoteInToLive can rewrite on final flip.
    await s3.putObject({
      Key: `${HOST}/${GUID}/live.json`,
      Body: '[]\n',
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/search-fanout.json`,
      Body: `${JSON.stringify({
        searchid: SEARCHID,
        queued: ['amazon', 'sql', 'ebay'],
        at: 't',
      })}\n`,
    });

    const deps = {
      bucket: 'test-a-clubs',
      putObject: s3.putObject,
      getObject: s3.getObject,
      headObject: s3.headObject,
      copyObject: s3.copyObject,
      getObjectTagging: async () => ({ TagSet: [] }),
      putObjectTagging: async () => ({}),
      now: '2026-10-25T12:01:00.000Z',
    };

    let flip = await recordSearchTerminal({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'amazon',
      status: 'serviced',
      products: 2,
    });
    assert.equal(flip.hasresults, false);
    let head = await s3.headObject({ Key: `${HOST}/${GUID}/` });
    assert.equal(String(head.Metadata.hasresults), '0');

    flip = await recordSearchTerminal({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'sql',
      status: 'serviced',
      products: 0,
    });
    assert.equal(flip.hasresults, false);

    flip = await recordSearchTerminal({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'ebay',
      status: 'dlq',
      products: 0,
    });
    assert.equal(flip.hasresults, true);
    head = await s3.headObject({ Key: `${HOST}/${GUID}/` });
    assert.equal(String(head.Metadata.hasresults), '1');
    // FR #4891: promote runs after hasresults flip (empty IN → enabled=1).
    assert.equal(String(head.Metadata.enabled), '1');
    assert.ok(flip.flip && flip.flip.promote);
    assert.equal(flip.flip.promote.enabled, 1);
  });

  it('stale searchid DONE records are ignored for the flip', async () => {
    await s3.putObject({
      Key: `${HOST}/${GUID}/`,
      Body: Buffer.alloc(0),
      Metadata: {
        hasresults: '0',
        enabled: '0',
        lastmod: '2026-10-25T12:00:00.000Z',
      },
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/search-fanout.json`,
      Body: JSON.stringify({
        searchid: SEARCHID,
        queued: ['amazon'],
        at: 't',
      }),
    });
    await writeSearchDoneRecord({
      putObject: s3.putObject,
      hostkey: HOST,
      guid: GUID,
      searchid: 'srch_OLD',
      source: 'amazon',
      status: 'serviced',
      products: 1,
      bucket: 'test-a-clubs',
    });
    const flip = await maybeSetHasResults({
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      putObject: s3.putObject,
      getObject: s3.getObject,
      headObject: s3.headObject,
      copyObject: s3.copyObject,
      getObjectTagging: async () => ({ TagSet: [] }),
      putObjectTagging: async () => ({}),
      bucket: 'test-a-clubs',
    });
    assert.equal(flip.hasresults, false);
    const head = await s3.headObject({ Key: `${HOST}/${GUID}/` });
    assert.equal(String(head.Metadata.hasresults), '0');
  });

  it('all-zero products fan-out still reaches hasresults=1', async () => {
    await s3.putObject({
      Key: `${HOST}/${GUID}/`,
      Body: Buffer.alloc(0),
      Metadata: {
        hasresults: '0',
        enabled: '0',
        lastmod: '2026-10-25T12:00:00.000Z',
      },
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/live.json`,
      Body: '[]\n',
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/search-fanout.json`,
      Body: JSON.stringify({
        searchid: SEARCHID,
        queued: ['cj', 'sql'],
        at: 't',
      }),
    });
    const deps = {
      bucket: 'test-a-clubs',
      putObject: s3.putObject,
      getObject: s3.getObject,
      headObject: s3.headObject,
      copyObject: s3.copyObject,
      getObjectTagging: async () => ({ TagSet: [] }),
      putObjectTagging: async () => ({}),
    };
    await recordSearchTerminal({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'cj',
      status: 'serviced',
      products: 0,
    });
    const flip = await recordSearchTerminal({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'sql',
      status: 'serviced',
      products: 0,
    });
    assert.equal(flip.hasresults, true);
    const head = await s3.headObject({ Key: `${HOST}/${GUID}/` });
    assert.equal(String(head.Metadata.hasresults), '1');
  });

  it('setHasResults preserves other metadata keys', async () => {
    await s3.putObject({
      Key: `${HOST}/${GUID}/`,
      Body: Buffer.alloc(0),
      Metadata: {
        uri: '/page',
        hasresults: '0',
        enabled: '0',
        annotated: '1',
        init: '0',
        lastmod: 'old',
      },
    });
    await setHasResults({
      Key: `${HOST}/${GUID}/`,
      bucket: 'test-a-clubs',
      headObject: s3.headObject,
      getObject: s3.getObject,
      copyObject: s3.copyObject,
      putObject: s3.putObject,
      getObjectTagging: async () => ({ TagSet: [] }),
      putObjectTagging: async () => ({}),
      now: '2026-10-25T12:05:00.000Z',
    });
    const head = await s3.headObject({ Key: `${HOST}/${GUID}/` });
    assert.equal(String(head.Metadata.hasresults), '1');
    assert.equal(String(head.Metadata.enabled), '0');
    assert.equal(String(head.Metadata.annotated), '1');
    assert.equal(String(head.Metadata.uri), '/page');
  });

  it('moveMessageToDlq writes DONE status=dlq when S3 deps present', async () => {
    await s3.putObject({
      Key: `${HOST}/${GUID}/`,
      Body: Buffer.alloc(0),
      Metadata: { hasresults: '0', enabled: '0', lastmod: 't' },
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/search-fanout.json`,
      Body: JSON.stringify({ searchid: SEARCHID, queued: ['cj'], at: 't' }),
    });
    const sent = [];
    const deleted = [];
    const msg = {
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'cj',
    };
    await moveMessageToDlq({
      record: {
        body: JSON.stringify(msg),
        receiptHandle: 'rh',
        attributes: { MessageGroupId: 'cj', ApproximateReceiveCount: '1' },
      },
      err: Object.assign(new Error('permanent'), {
        code: 'cj_client_error',
        nonRetryable: true,
      }),
      msg,
      source: 'cj',
      sendMessage: async (input) => {
        sent.push(input);
      },
      deleteMessage: async (input) => {
        deleted.push(input);
      },
      queueUrl: 'https://sqs/q',
      dlqUrl: 'https://sqs/dlq',
      putObject: s3.putObject,
      getObject: s3.getObject,
      headObject: s3.headObject,
      copyObject: s3.copyObject,
      getObjectTagging: async () => ({ TagSet: [] }),
      putObjectTagging: async () => ({}),
      envVars: { A_CLUBS_BUCKET: 'test-a-clubs' },
    });
    assert.equal(sent.length, 1);
    assert.equal(deleted.length, 1);
    const done = await s3.getObject({
      Key: `${HOST}/${GUID}/DONE/${SEARCHID}-cj.json`,
    });
    const body = JSON.parse(Buffer.from(await streamToBuf(done.Body)).toString('utf8'));
    assert.equal(body.status, 'dlq');
    const head = await s3.headObject({ Key: `${HOST}/${GUID}/` });
    assert.equal(String(head.Metadata.hasresults), '1');
  });
});

async function streamToBuf(body) {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  if (body && typeof body.transformToByteArray === 'function') {
    return Buffer.from(await body.transformToByteArray());
  }
  if (body && typeof body[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    for await (const c of body) chunks.push(Buffer.from(c));
    return Buffer.concat(chunks);
  }
  return Buffer.from(String(body || ''));
}
