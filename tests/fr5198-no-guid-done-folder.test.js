'use strict';

/**
 * FR #5198: never write a-clubs/{host}/{guid}/DONE/; track terminals at
 * _search-done/{searchid}/{source}.json (outside the GUID club folder).
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { isExcludedKey } = require('../shared/aClubs/changeEvents');
const {
  doneObjectKey,
  SEARCH_DONE_PREFIX,
  writeSearchDoneRecord,
  recordSearchTerminal,
  maybeSetHasResults,
} = require('../shared/search/searchDone');
const { writeAClubsDoneFs } = require('../walrus/src/writeAClubsDoneFs');
const {
  writeLiveProviderInResult,
} = require('../shared/search/writeLiveProviderInResult');

const HOST = 'www.mymodelflyingclub.co.uk';
const GUID = '8504174c-f21f-4fe0-b8eb-98e7d7ceaed0';
const SEARCHID = 'srch_5198_nodone';

describe('FR #5198 no GUID DONE/ folder', () => {
  /** @type {ReturnType<typeof createMemoryS3>} */
  let s3;

  beforeEach(() => {
    s3 = createMemoryS3();
  });

  it('doneObjectKey is under _search-done/{searchid}/{source}.json', () => {
    assert.equal(SEARCH_DONE_PREFIX, '_search-done');
    assert.equal(
      doneObjectKey(HOST, GUID, SEARCHID, 'Rakuten'),
      `_search-done/${SEARCHID}/rakuten.json`,
    );
    assert.equal(
      doneObjectKey(HOST, GUID, SEARCHID, 'sql').includes(`/${HOST}/`),
      false,
    );
    assert.equal(doneObjectKey(HOST, GUID, SEARCHID, 'sql').includes('/DONE/'), false);
  });

  it('_search-done keys are excluded from annotation change events', () => {
    assert.equal(
      isExcludedKey(`_search-done/${SEARCHID}/ebay.json`),
      true,
    );
    // legacy GUID DONE/ still excluded
    assert.equal(
      isExcludedKey(`${HOST}/${GUID}/DONE/${SEARCHID}-ebay.json`),
      true,
    );
  });

  it('recordSearchTerminal never puts under host/guid/DONE/', async () => {
    const puts = [];
    const putObject = async (args) => {
      puts.push(args);
      return s3.putObject(args);
    };
    await s3.putObject({
      Key: `${HOST}/${GUID}/search-fanout.json`,
      Body: JSON.stringify({ searchid: SEARCHID, queued: ['ebay'], at: 't' }),
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/`,
      Body: Buffer.alloc(0),
      Metadata: { hasresults: '0', enabled: '0', annotated: '0', lastmod: 't' },
    });

    await recordSearchTerminal({
      putObject,
      getObject: s3.getObject,
      headObject: s3.headObject,
      copyObject: s3.copyObject,
      getObjectTagging: async () => ({ TagSet: [] }),
      putObjectTagging: async () => ({}),
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'ebay',
      status: 'serviced',
      products: 0,
      bucket: 'a-clubs',
      recheckDelayMs: 0,
    });

    const keys = puts.map((p) => String(p.Key || ''));
    assert.ok(keys.includes(`_search-done/${SEARCHID}/ebay.json`));
    assert.equal(
      keys.some((k) => /\/DONE\//i.test(k)),
      false,
      'no GUID DONE/ puts',
    );
  });

  it('zero-product live finish writes _search-done only (never IN/ or GUID DONE/)', async () => {
    const puts = [];
    const putObject = async (args) => {
      puts.push(args);
      return s3.putObject(args);
    };
    await s3.putObject({
      Key: `${HOST}/${GUID}/search-fanout.json`,
      Body: JSON.stringify({ searchid: SEARCHID, queued: ['rakuten'], at: 't' }),
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/`,
      Body: Buffer.alloc(0),
      Metadata: { hasresults: '0', enabled: '0', annotated: '0', lastmod: 't' },
    });

    const out = await writeLiveProviderInResult({
      msg: { hostkey: HOST, guid: GUID, searchid: SEARCHID, env: 'sandbox' },
      source: 'rakuten',
      products: [],
      envVars: { A_CLUBS_BUCKET: 'a-clubs' },
      putObject,
      headObject: s3.headObject,
      getObject: s3.getObject,
      copyObject: s3.copyObject,
      getObjectTagging: async () => ({ TagSet: [] }),
      putObjectTagging: async () => ({}),
      recheckDelayMs: 0,
    });
    assert.equal(out.skipped, 'no_products');
    const keys = puts.map((p) => String(p.Key || ''));
    assert.ok(keys.includes(`_search-done/${SEARCHID}/rakuten.json`));
    assert.equal(keys.some((k) => /\/IN\//i.test(k)), false);
    assert.equal(keys.some((k) => /\/DONE\//i.test(k)), false);
  });

  it('walrus mapped-drive DONE lands under _search-done not host/guid/DONE', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr5198-'));
    const out = await writeAClubsDoneFs({
      root: tmp,
      msg: { host: HOST, guid: GUID, searchid: SEARCHID },
      source: 'sql',
      status: 'serviced',
      products: 0,
      now: '2026-10-26T17:00:00.000Z',
    });
    assert.ok(out.abs);
    assert.match(out.key, new RegExp(`^_search-done/${SEARCHID}/sql\\.json$`));
    assert.equal(fs.existsSync(out.abs), true);
    const legacy = path.join(tmp, HOST, GUID, 'DONE', `${SEARCHID}-sql.json`);
    assert.equal(fs.existsSync(legacy), false);
  });

  it('maybeSetHasResults accepts legacy GUID DONE/ during transition', async () => {
    await s3.putObject({
      Key: `${HOST}/${GUID}/`,
      Body: Buffer.alloc(0),
      Metadata: { hasresults: '0', enabled: '0', annotated: '1', lastmod: 't' },
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/search-fanout.json`,
      Body: JSON.stringify({ searchid: SEARCHID, queued: ['cj'], at: 't' }),
    });
    // legacy only
    await s3.putObject({
      Key: `${HOST}/${GUID}/DONE/${SEARCHID}-cj.json`,
      Body: JSON.stringify({
        searchid: SEARCHID,
        source: 'cj',
        status: 'serviced',
        products: 0,
        at: 't',
      }),
    });
    const flip = await maybeSetHasResults({
      putObject: s3.putObject,
      getObject: s3.getObject,
      headObject: s3.headObject,
      copyObject: s3.copyObject,
      getObjectTagging: async () => ({ TagSet: [] }),
      putObjectTagging: async () => ({}),
      listObjectsV2: s3.listObjectsV2,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      bucket: 'a-clubs',
    });
    assert.equal(flip.hasresults, true);
  });

  it('writeSearchDoneRecord body still carries searchid/source/status', async () => {
    const out = await writeSearchDoneRecord({
      putObject: s3.putObject,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'amazon',
      status: 'dlq',
      products: 0,
      now: '2026-10-26T17:05:00.000Z',
      bucket: 'a-clubs',
    });
    assert.equal(out.Key, `_search-done/${SEARCHID}/amazon.json`);
    assert.equal(out.body.status, 'dlq');
    assert.equal(out.body.hostkey, HOST);
    assert.equal(out.body.guid, GUID);
  });
});
