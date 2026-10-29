'use strict';

/**
 * FR #5265: hasresults monitor must not re-flip a GUID every pass after
 * clearHasResults. Recheck skips when this searchid was already promoted
 * and no newer DONE landed.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const {
  recheckGuidHasResults,
  isAlreadyPromotedForFanout,
} = require('../shared/search/recheckHasResults');
const { maybeSetHasResults } = require('../shared/search/searchDone');
const { clearHasResults } = require('../shared/widgets/hostFolderMeta');
const {
  runHasresultsMonitorPass,
} = require('../redqueen/src/hasresultsMonitor');

const HOST = 'www.mymodelflyingclub.co.uk';
const GUID = '8504174c-aaaa-bbbb-cccc-ddddeeeeffff';
const SEARCHID = 'srch_5265_reflip';
const SEARCHID2 = 'srch_5265_again';
const MARKER = `${HOST}/${GUID}/`;
const LIVE = `${HOST}/${GUID}/live.json`;

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
    deleteObject: async ({ Key }) => {
      if (typeof s3.deleteObject === 'function') return s3.deleteObject({ Key });
      return {};
    },
    recheckDelayMs: 0,
    sleep: async () => {},
    ...(extras || {}),
  };
}

async function seedPromotedCleared(s3, opts) {
  const searchid = (opts && opts.searchid) || SEARCHID;
  const doneAt = (opts && opts.doneAt) || '2026-10-27T12:00:00.000Z';
  const lastmod = (opts && opts.lastmod) || '2026-10-28T17:00:00.000Z';
  const promotedsearchid =
    opts && Object.prototype.hasOwnProperty.call(opts, 'promotedsearchid')
      ? opts.promotedsearchid
      : searchid;
  const metadata = {
    hasresults: '0',
    enabled: '1',
    annotated: '1',
    lastmod,
  };
  if (promotedsearchid != null && promotedsearchid !== '') {
    metadata.promotedsearchid = String(promotedsearchid);
  }
  await s3.putObject({
    Key: MARKER,
    Body: Buffer.alloc(0),
    Metadata: metadata,
  });
  await s3.putObject({
    Key: LIVE,
    Body: `${JSON.stringify([{ id: 'ebay-1', title: 'cub' }], null, 2)}\n`,
  });
  await s3.putObject({
    Key: `${HOST}/${GUID}/search-fanout.json`,
    Body: `${JSON.stringify({ searchid, queued: ['ebay', 'sql'], at: doneAt })}\n`,
  });
  await s3.putObject({
    Key: `_search-done/${searchid}/ebay.json`,
    Body: `${JSON.stringify({
      searchid,
      source: 'ebay',
      status: 'serviced',
      products: 3,
      at: doneAt,
      hostkey: HOST,
      guid: GUID,
    })}\n`,
  });
  await s3.putObject({
    Key: `_search-done/${searchid}/sql.json`,
    Body: `${JSON.stringify({
      searchid,
      source: 'sql',
      status: 'serviced',
      products: 0,
      at: doneAt,
      hostkey: HOST,
      guid: GUID,
    })}\n`,
  });
}

describe('FR #5265 hasresults monitor no re-flip', () => {
  /** @type {ReturnType<typeof createMemoryS3>} */
  let s3;

  beforeEach(() => {
    s3 = createMemoryS3();
  });

  it('isAlreadyPromotedForFanout is true when promotedsearchid matches', async () => {
    await seedPromotedCleared(s3);
    const deps = s3Deps(s3);
    const head = await s3.headObject({ Key: MARKER });
    const out = await isAlreadyPromotedForFanout({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      metadata: head.Metadata,
      queued: ['ebay', 'sql'],
    });
    assert.equal(out.skip, true);
    assert.equal(out.reason, 'promotedsearchid');
  });

  it('recheck does not flip when already promoted and no newer DONE', async () => {
    await seedPromotedCleared(s3);
    const deps = s3Deps(s3);
    const liveBefore = (await s3.getObject({ Key: LIVE })).Body.toString('utf8');
    const headBefore = await s3.headObject({ Key: MARKER });

    const one = await recheckGuidHasResults({
      ...deps,
      hostkey: HOST,
      guid: GUID,
    });
    assert.equal(one.flipped, false);
    assert.equal(one.reason, 'already_promoted');

    const two = await recheckGuidHasResults({
      ...deps,
      hostkey: HOST,
      guid: GUID,
    });
    assert.equal(two.flipped, false);

    const headAfter = await s3.headObject({ Key: MARKER });
    assert.equal(String(headAfter.Metadata.hasresults), '0');
    assert.equal(String(headAfter.Metadata.lastmod), String(headBefore.Metadata.lastmod));
    const liveAfter = (await s3.getObject({ Key: LIVE })).Body.toString('utf8');
    assert.equal(liveAfter, liveBefore);
  });

  it('legacy enabled=1 without promotedsearchid skips when lastmod >= DONE at', async () => {
    await seedPromotedCleared(s3, { promotedsearchid: '' });
    const deps = s3Deps(s3);
    const out = await recheckGuidHasResults({
      ...deps,
      hostkey: HOST,
      guid: GUID,
    });
    assert.equal(out.flipped, false);
    assert.equal(out.reason, 'already_promoted');
  });

  it('re-promotes once when a newer DONE lands after promotion', async () => {
    await seedPromotedCleared(s3, {
      searchid: SEARCHID,
      doneAt: '2026-10-27T12:00:00.000Z',
      lastmod: '2026-10-28T17:00:00.000Z',
      promotedsearchid: SEARCHID,
    });
    // New fan-out searchid with fresh DONE (newer than last promotion).
    await s3.putObject({
      Key: `${HOST}/${GUID}/search-fanout.json`,
      Body: `${JSON.stringify({
        searchid: SEARCHID2,
        queued: ['ebay'],
        at: '2026-10-28T18:00:00.000Z',
      })}\n`,
    });
    await s3.putObject({
      Key: `_search-done/${SEARCHID2}/ebay.json`,
      Body: `${JSON.stringify({
        searchid: SEARCHID2,
        source: 'ebay',
        status: 'serviced',
        products: 5,
        at: '2026-10-28T18:05:00.000Z',
        hostkey: HOST,
        guid: GUID,
      })}\n`,
    });
    // Clear old promotedsearchid mismatch is enough; also clear hasresults.
    const head0 = await s3.headObject({ Key: MARKER });
    await s3.putObject({
      Key: MARKER,
      Body: Buffer.alloc(0),
      Metadata: {
        ...head0.Metadata,
        hasresults: '0',
        enabled: '1',
        promotedsearchid: SEARCHID,
        lastmod: '2026-10-28T17:00:00.000Z',
      },
    });

    const deps = s3Deps(s3);
    const flip = await recheckGuidHasResults({
      ...deps,
      hostkey: HOST,
      guid: GUID,
    });
    assert.equal(flip.flipped, true);
    let head = await s3.headObject({ Key: MARKER });
    assert.equal(String(head.Metadata.hasresults), '1');
    assert.equal(String(head.Metadata.promotedsearchid), SEARCHID2);

    await clearHasResults({
      Key: MARKER,
      ...deps,
      now: '2026-10-28T18:10:00.000Z',
    });
    head = await s3.headObject({ Key: MARKER });
    assert.equal(String(head.Metadata.hasresults), '0');
    assert.equal(String(head.Metadata.promotedsearchid), SEARCHID2);

    const again = await recheckGuidHasResults({
      ...deps,
      hostkey: HOST,
      guid: GUID,
    });
    assert.equal(again.flipped, false);
    assert.equal(again.reason, 'already_promoted');
  });

  it('maybeSetHasResults stamps promotedsearchid', async () => {
    await s3.putObject({
      Key: MARKER,
      Body: Buffer.alloc(0),
      Metadata: {
        hasresults: '0',
        enabled: '0',
        lastmod: '2026-10-27T10:00:00.000Z',
      },
    });
    await s3.putObject({
      Key: LIVE,
      Body: '[]\n',
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/search-fanout.json`,
      Body: `${JSON.stringify({ searchid: SEARCHID, queued: ['ebay'], at: 't' })}\n`,
    });
    await s3.putObject({
      Key: `_search-done/${SEARCHID}/ebay.json`,
      Body: `${JSON.stringify({
        searchid: SEARCHID,
        source: 'ebay',
        status: 'serviced',
        products: 1,
        at: '2026-10-27T11:00:00.000Z',
      })}\n`,
    });
    const deps = s3Deps(s3);
    const flip = await maybeSetHasResults({
      ...deps,
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      now: '2026-10-27T11:30:00.000Z',
    });
    assert.equal(flip.hasresults, true);
    const head = await s3.headObject({ Key: MARKER });
    assert.equal(String(head.Metadata.hasresults), '1');
    assert.equal(String(head.Metadata.promotedsearchid), SEARCHID);
  });

  it('two monitor passes leave hasresults and live.json unchanged after promote+clear', async () => {
    await seedPromotedCleared(s3, {
      promotedsearchid: SEARCHID,
      lastmod: '2026-10-28T17:40:00.000Z',
      doneAt: '2026-10-27T12:00:00.000Z',
    });
    const deps = s3Deps(s3);
    const liveBefore = (await s3.getObject({ Key: LIVE })).Body.toString('utf8');
    const headBefore = await s3.headObject({ Key: MARKER });

    const pass1 = await runHasresultsMonitorPass({
      ...deps,
      runAgent: async () => ({ exitCode: 0, liveWritten: true }),
    });
    assert.equal(pass1.recheck.flipped, 0);

    const pass2 = await runHasresultsMonitorPass({
      ...deps,
      runAgent: async () => ({ exitCode: 0, liveWritten: true }),
    });
    assert.equal(pass2.recheck.flipped, 0);
    assert.equal(pass2.scanned, 0);

    const headAfter = await s3.headObject({ Key: MARKER });
    assert.equal(String(headAfter.Metadata.hasresults), '0');
    assert.equal(String(headAfter.Metadata.lastmod), String(headBefore.Metadata.lastmod));
    const liveAfter = (await s3.getObject({ Key: LIVE })).Body.toString('utf8');
    assert.equal(liveAfter, liveBefore);
  });

  it('docs mention FR #5265 no re-flip', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'search-fanout.md'),
      'utf8',
    );
    assert.match(text, /5265|#5265/);
    assert.match(text, /promotedsearchid|already promoted|re-flip/i);
  });
});
