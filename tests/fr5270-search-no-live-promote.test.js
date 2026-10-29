'use strict';

/**
 * FR #5270: search / drain / recheck set hasresults only. They must not write
 * live.json or enabled=1. The agent / hasresults monitor builds live.json.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const {
  recordSearchTerminal,
  maybeSetHasResults,
} = require('../shared/search/searchDone');
const {
  recheckGuidHasResults,
} = require('../shared/search/recheckHasResults');
const {
  runHasresultsAgentWork,
} = require('../shared/widgets/promoteInToLive');

const HOST = 'www.mymodelflyingclub.co.uk';
const GUID = '8504174c-f21f-4fe0-b8eb-98e7d7ceaed0';
const SEARCHID = 'srch_5270_nolive';
const MARKER = `${HOST}/${GUID}/`;
const LIVE = `${HOST}/${GUID}/live.json`;

function trackLivePuts(s3) {
  /** @type {string[]} */
  const livePuts = [];
  const putObject = async (input) => {
    if (String(input.Key || '').endsWith('/live.json')) {
      livePuts.push(String(input.Key));
    }
    return s3.putObject(input);
  };
  return { putObject, livePuts };
}

describe('FR #5270 search path does not build live.json', () => {
  /** @type {ReturnType<typeof createMemoryS3>} */
  let s3;

  beforeEach(async () => {
    s3 = createMemoryS3();
    await s3.putObject({
      Key: MARKER,
      Body: Buffer.alloc(0),
      Metadata: {
        hasresults: '0',
        enabled: '0',
        annotated: '1',
        lastmod: '2026-10-29T07:00:00.000Z',
      },
    });
    await s3.putObject({
      Key: `${HOST}/`,
      Body: Buffer.alloc(0),
      Metadata: { userid: 'ABC1234Z', hostkey: HOST, lastmod: 't0' },
    });
    await s3.putObject({
      Key: LIVE,
      Body: '[]\n',
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/search-fanout.json`,
      Body: `${JSON.stringify({
        searchid: SEARCHID,
        queued: ['ebay'],
        at: 't',
      })}\n`,
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/IN/${SEARCHID}-ebay.json`,
      Body: `${JSON.stringify([
        { id: 'ebay-1', title: 'Volantex Cub', rank: 200 },
        { id: 'ebay-2', title: 'Socks', rank: 1 },
      ])}\n`,
    });
  });

  it('recordSearchTerminal / maybeSetHasResults never put live.json and leave enabled unset', async () => {
    const { putObject, livePuts } = trackLivePuts(s3);
    const deps = {
      bucket: 'a-clubs',
      putObject,
      getObject: s3.getObject,
      headObject: s3.headObject,
      copyObject: s3.copyObject,
      listObjectsV2: s3.listObjectsV2,
      getObjectTagging: async () => ({ TagSet: [] }),
      putObjectTagging: async () => ({}),
      now: '2026-10-29T07:21:38.000Z',
    };
    const flip = await recordSearchTerminal({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'ebay',
      status: 'serviced',
      products: 2,
    });
    assert.equal(flip.hasresults, true);
    assert.equal(livePuts.length, 0);
    let head = await s3.headObject({ Key: MARKER });
    assert.equal(String(head.Metadata.hasresults), '1');
    assert.notEqual(String(head.Metadata.enabled || '0'), '1');
    assert.equal(
      (await s3.getObject({ Key: LIVE })).Body.toString('utf8'),
      '[]\n',
    );

    const again = await maybeSetHasResults({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
    });
    assert.equal(again.hasresults, true);
    assert.equal(livePuts.length, 0);
    head = await s3.headObject({ Key: MARKER });
    assert.notEqual(String(head.Metadata.enabled || '0'), '1');
  });

  it('recheckIncomplete path does not write live.json', async () => {
    await s3.putObject({
      Key: `_search-done/${SEARCHID}/ebay.json`,
      Body: `${JSON.stringify({
        searchid: SEARCHID,
        source: 'ebay',
        status: 'serviced',
        products: 2,
        at: '2026-10-29T07:20:00.000Z',
      })}\n`,
    });
    const { putObject, livePuts } = trackLivePuts(s3);
    const out = await recheckGuidHasResults({
      bucket: 'a-clubs',
      putObject,
      getObject: s3.getObject,
      headObject: s3.headObject,
      copyObject: s3.copyObject,
      listObjectsV2: s3.listObjectsV2,
      getObjectTagging: async () => ({ TagSet: [] }),
      putObjectTagging: async () => ({}),
      hostkey: HOST,
      guid: GUID,
      now: '2026-10-29T07:22:00.000Z',
    });
    assert.equal(out.flipped, true);
    assert.equal(livePuts.length, 0);
    const head = await s3.headObject({ Key: MARKER });
    assert.equal(String(head.Metadata.hasresults), '1');
    assert.notEqual(String(head.Metadata.enabled || '0'), '1');
  });

  it('agent work builds live.json from IN/ and sets enabled=1', async () => {
    const { putObject, livePuts } = trackLivePuts(s3);
    await s3.putObject({
      Key: MARKER,
      Body: Buffer.alloc(0),
      Metadata: {
        hasresults: '1',
        enabled: '0',
        annotated: '1',
        lastmod: '2026-10-29T07:21:00.000Z',
      },
    });
    const agent = await runHasresultsAgentWork({
      host: HOST,
      guid: GUID,
      bucket: 'a-clubs',
      putObject,
      getObject: s3.getObject,
      headObject: s3.headObject,
      copyObject: s3.copyObject,
      listObjectsV2: s3.listObjectsV2,
      getObjectTagging: async () => ({ TagSet: [] }),
      putObjectTagging: async () => ({}),
      now: '2026-10-29T07:23:00.000Z',
    });
    assert.equal(agent.ok, true);
    assert.equal(agent.enabled, 1);
    assert.ok(livePuts.length >= 1);
    const head = await s3.headObject({ Key: MARKER });
    assert.equal(String(head.Metadata.enabled), '1');
    const live = JSON.parse(
      (await s3.getObject({ Key: LIVE })).Body.toString('utf8'),
    );
    assert.ok(live.length >= 1);
    assert.ok(live.some((p) => p && p.id === 'ebay-1'));
  });

  it('searchDone source and docs pin FR #5270', () => {
    const done = fs.readFileSync(
      path.join(__dirname, '..', 'shared', 'search', 'searchDone.js'),
      'utf8',
    );
    assert.match(done, /5270|#5270/);
    assert.doesNotMatch(done, /promoteInToLive/);
    const docs = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'search-fanout.md'),
      'utf8',
    );
    assert.match(docs, /5270|#5270/);
    assert.match(docs, /does \*\*not\*\* write `live\.json`|does not write live\.json/i);
  });
});
