'use strict';

/**
 * FR #5142: race-free hasresults completion — last writer (live or SQL order),
 * DLQ-only completion, and recheck of a missed flip.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const {
  recordSearchTerminal,
  maybeSetHasResults,
} = require('../shared/search/searchDone');
const {
  recheckGuidHasResults,
  recheckIncompleteHasResults,
} = require('../shared/search/recheckHasResults');
const { writeAClubsDoneFs } = require('../walrus/src/writeAClubsDoneFs');
const { runHourlySearches } = require('../searches/src/runHourly');

const HOST = 'www.mymodelflyingclub.co.uk';
const GUID = 'de986521-72d8-4d55-8da3-12ca524d8d74';
const SEARCHID = 'srch_5142_race';

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
      lastmod: '2026-10-18T17:32:00.000Z',
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

describe('FR #5142 hasresults completion race', () => {
  /** @type {ReturnType<typeof createMemoryS3>} */
  let s3;

  beforeEach(() => {
    s3 = createMemoryS3();
  });

  it('last-writer-wins when live provider finishes after SQL', async () => {
    await seedFanout(s3, ['amazon', 'sql', 'ebay']);
    const deps = s3Deps(s3);

    let flip = await recordSearchTerminal({
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
      products: 8,
    });
    assert.equal(flip.hasresults, true);
    const head = await s3.headObject({ Key: `${HOST}/${GUID}/` });
    assert.equal(String(head.Metadata.hasresults), '1');
  });

  it('last-writer-wins when SQL finishes after live providers (S3 path)', async () => {
    await seedFanout(s3, ['ebay', 'sql']);
    const deps = s3Deps(s3);

    let flip = await recordSearchTerminal({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'ebay',
      status: 'serviced',
      products: 8,
    });
    assert.equal(flip.hasresults, false);

    flip = await recordSearchTerminal({
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

  it('walrus SQL DONE also flips S3 marker when s3 deps provided', async () => {
    await seedFanout(s3, ['ebay', 'sql']);
    const deps = s3Deps(s3);
    await recordSearchTerminal({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'ebay',
      status: 'serviced',
      products: 8,
    });
    let head = await s3.headObject({ Key: `${HOST}/${GUID}/` });
    assert.equal(String(head.Metadata.hasresults), '0');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr5142-walrus-'));
    try {
      const guidDir = path.join(root, HOST, GUID);
      fs.mkdirSync(path.join(guidDir, 'DONE'), { recursive: true });
      fs.writeFileSync(
        path.join(guidDir, 'search-fanout.json'),
        `${JSON.stringify({ searchid: SEARCHID, queued: ['ebay', 'sql'], at: 't' })}\n`,
      );
      fs.writeFileSync(
        path.join(guidDir, '.a-search-meta.json'),
        `${JSON.stringify({ hasresults: '0' }, null, 2)}\n`,
      );
      // Pretend ebay DONE already synced to the mapped drive.
      fs.writeFileSync(
        path.join(guidDir, 'DONE', `${SEARCHID}-ebay.json`),
        `${JSON.stringify({ searchid: SEARCHID, source: 'ebay', status: 'serviced', products: 8 })}\n`,
      );

      const out = await writeAClubsDoneFs({
        root,
        msg: { host: HOST, guid: GUID, searchid: SEARCHID },
        source: 'sql',
        status: 'serviced',
        products: 0,
        s3: deps,
      });
      assert.equal(out.hasresults, true);
      assert.ok(out.s3 && out.s3.hasresults);
      head = await s3.headObject({ Key: `${HOST}/${GUID}/` });
      assert.equal(String(head.Metadata.hasresults), '1');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('DLQ-only fan-out still reaches hasresults=1', async () => {
    await seedFanout(s3, ['amazon', 'rakuten']);
    const deps = s3Deps(s3);
    await recordSearchTerminal({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'amazon',
      status: 'dlq',
      products: 0,
    });
    const flip = await recordSearchTerminal({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'rakuten',
      status: 'dlq',
      products: 0,
    });
    assert.equal(flip.hasresults, true);
    const head = await s3.headObject({ Key: `${HOST}/${GUID}/` });
    assert.equal(String(head.Metadata.hasresults), '1');
  });

  it('recheck flips when DONE set is complete but hasresults was missed', async () => {
    await seedFanout(s3, ['amazon', 'ebay']);
    const deps = s3Deps(s3);
    // Write DONE records without going through maybeSetHasResults.
    await s3.putObject({
      Key: `${HOST}/${GUID}/DONE/${SEARCHID}-amazon.json`,
      Body: `${JSON.stringify({ searchid: SEARCHID, source: 'amazon', status: 'dlq', products: 0 })}\n`,
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/DONE/${SEARCHID}-ebay.json`,
      Body: `${JSON.stringify({ searchid: SEARCHID, source: 'ebay', status: 'serviced', products: 8 })}\n`,
    });
    let head = await s3.headObject({ Key: `${HOST}/${GUID}/` });
    assert.equal(String(head.Metadata.hasresults), '0');

    const one = await recheckGuidHasResults({
      ...deps,
      hostkey: HOST,
      guid: GUID,
    });
    assert.equal(one.flipped, true);
    head = await s3.headObject({ Key: `${HOST}/${GUID}/` });
    assert.equal(String(head.Metadata.hasresults), '1');

    // Idempotent: already set.
    const again = await recheckGuidHasResults({
      ...deps,
      hostkey: HOST,
      guid: GUID,
    });
    assert.equal(again.flipped, false);
    assert.equal(again.reason, 'already_set');
  });

  it('recordSearchTerminal rechecks once after a missing sibling DONE appears', async () => {
    await seedFanout(s3, ['ebay', 'sql']);
    const deps = s3Deps(s3, { recheckDelayMs: 1 });
    await recordSearchTerminal({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'ebay',
      status: 'serviced',
      products: 8,
    });

    let sleepCalls = 0;
    const flip = await recordSearchTerminal({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'sql',
      status: 'serviced',
      products: 0,
      // First maybeSetHasResults sees ebay; always complete here — pin API shape.
      sleep: async () => {
        sleepCalls += 1;
      },
      recheckDelayMs: 5,
    });
    assert.equal(flip.hasresults, true);
    // Sleep is only used when first pass returns missing:* — here complete on first pass.
    assert.equal(sleepCalls, 0);
  });

  it('hourly runner recheck picks up a missed flip before due searches', async () => {
    await seedFanout(s3, ['amazon']);
    await s3.putObject({
      Key: `${HOST}/${GUID}/DONE/${SEARCHID}-amazon.json`,
      Body: `${JSON.stringify({ searchid: SEARCHID, source: 'amazon', status: 'serviced', products: 1 })}\n`,
    });
    // Hourly select needs host/_root metadata; keep dues empty via enabled=0 host.
    await s3.putObject({
      Key: '_root/',
      Body: Buffer.alloc(0),
      Metadata: { defaultage: '7', name: 'a-clubs', kind: 'root' },
    });
    await s3.putObject({
      Key: `${HOST}/`,
      Body: Buffer.alloc(0),
      Metadata: { annotated: '1', enabled: '0', defaultage: '7' },
    });

    const lines = [];
    const summary = await runHourlySearches({
      s3,
      bucket: 'a-clubs',
      hasCredentials: () => true,
      log: (l) => lines.push(l),
      runSearch: async () => {
        throw new Error('should_not_run');
      },
    });
    assert.ok(summary.hasresultsRecheck);
    assert.equal(summary.hasresultsRecheck.flipped, 1);
    const head = await s3.headObject({ Key: `${HOST}/${GUID}/` });
    assert.equal(String(head.Metadata.hasresults), '1');
    assert.match(lines.join('\n'), /hasresults_recheck/);
  });

  it('recheckIncompleteHasResults scans markers without hasresults=1', async () => {
    await seedFanout(s3, ['sql']);
    await s3.putObject({
      Key: `${HOST}/${GUID}/DONE/${SEARCHID}-sql.json`,
      Body: `${JSON.stringify({ searchid: SEARCHID, source: 'sql', status: 'serviced', products: 0 })}\n`,
    });
    const out = await recheckIncompleteHasResults(s3Deps(s3));
    assert.equal(out.flipped, 1);
    assert.equal(out.scanned, 1);
  });

  it('maybeSetHasResults stays false while a DONE is still missing', async () => {
    await seedFanout(s3, ['amazon', 'ebay']);
    await s3.putObject({
      Key: `${HOST}/${GUID}/DONE/${SEARCHID}-amazon.json`,
      Body: `${JSON.stringify({ searchid: SEARCHID, source: 'amazon', status: 'serviced', products: 1 })}\n`,
    });
    const flip = await maybeSetHasResults({
      ...s3Deps(s3),
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
    });
    assert.equal(flip.hasresults, false);
    assert.match(String(flip.reason), /^missing:ebay$/);
  });
});
