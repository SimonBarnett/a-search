'use strict';

/**
 * FR #5047: empty live after hasresults -> GUID feedback/no-results.json +
 * sector ledger upsert (dedupe by sector count) for affiliate/merchant agents.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const {
  recordSearchTerminal,
} = require('../shared/search/searchDone');
const {
  normalizeSector,
  extractSectorHint,
  buildNoResultsSignal,
  upsertSectorLedger,
  noResultsSignalKey,
  sectorLedgerKey,
  LEDGER_SCHEMA,
  SIGNAL_SCHEMA,
  recordNoResultsIfEmpty,
} = require('../shared/search/noResultsFeedback');
const { isExcludedKey } = require('../shared/aClubs/changeEvents');

const HOST = 'www.mymodelflyingclub.test';
const GUID = 'de986521-aaaa-4bbb-8ccc-dddddddddddd';
const SEARCHID = 'srch_5047_empty';

describe('FR #5047 no-results vendor feedback', () => {
  /** @type {ReturnType<typeof createMemoryS3>} */
  let s3;

  beforeEach(() => {
    s3 = createMemoryS3();
  });

  it('normalizeSector lowercases and collapses whitespace', () => {
    assert.equal(normalizeSector('  RC  Airplane '), 'rc airplane');
    assert.equal(normalizeSector(''), '');
  });

  it('extractSectorHint prefers page product_types then host category', () => {
    assert.equal(
      extractSectorHint({
        pageAnn: { selection: { product_types: ['RTF beginner RC airplane'] } },
        hostAnn: { affiliate_opportunities: [{ category: 'Hobbies' }] },
        queries: [{ q: 'Volantex Sport Cub', intent: 'page' }],
      }),
      'rtf beginner rc airplane',
    );
    assert.equal(
      extractSectorHint({
        pageAnn: null,
        hostAnn: { affiliate_opportunities: [{ category: 'Hobbies' }] },
        queries: [{ q: 'Volantex Sport Cub' }],
      }),
      'hobbies',
    );
    assert.equal(
      extractSectorHint({
        queries: [{ q: 'Volantex Sport Cub S2 Xpilot' }],
      }),
      'volantex sport cub s2',
    );
  });

  it('buildNoResultsSignal carries schema, message, queries', () => {
    const signal = buildNoResultsSignal({
      host: HOST,
      guid: GUID,
      searchid: SEARCHID,
      queries: [{ q: 'Volantex Sport Cub' }, { q: 'Xpilot' }],
      sector: 'RC Airplane',
      at: '2026-10-25T20:35:00.000Z',
    });
    assert.equal(signal.schema, SIGNAL_SCHEMA);
    assert.equal(signal.sector, 'rc airplane');
    assert.equal(signal.message, 'need more vendors in sector rc airplane');
    assert.deepEqual(signal.queries, ['Volantex Sport Cub', 'Xpilot']);
    assert.equal(signal.partCount, 0);
  });

  it('upsertSectorLedger increments count and dedupes pages/queries', () => {
    const s1 = buildNoResultsSignal({
      host: HOST,
      guid: GUID,
      queries: ['Volantex Sport Cub'],
      sector: 'rc airplane',
      at: '2026-10-25T20:00:00.000Z',
    });
    let ledger = upsertSectorLedger(null, s1);
    assert.equal(ledger.schema, LEDGER_SCHEMA);
    assert.equal(ledger.sectors['rc airplane'].count, 1);
    assert.deepEqual(ledger.sectors['rc airplane'].exampleQueries, [
      'Volantex Sport Cub',
    ]);
    assert.equal(ledger.sectors['rc airplane'].pages.length, 1);

    const s2 = buildNoResultsSignal({
      host: HOST,
      guid: GUID,
      queries: ['Volantex Sport Cub', 'Xpilot'],
      sector: 'RC Airplane',
      at: '2026-10-25T21:00:00.000Z',
    });
    ledger = upsertSectorLedger(ledger, s2);
    assert.equal(ledger.sectors['rc airplane'].count, 2, 'same sector increments');
    assert.deepEqual(ledger.sectors['rc airplane'].exampleQueries, [
      'Volantex Sport Cub',
      'Xpilot',
    ]);
    assert.equal(
      ledger.sectors['rc airplane'].pages.length,
      1,
      'same host+guid does not duplicate page row',
    );
    assert.equal(ledger.sectors['rc airplane'].lastAt, '2026-10-25T21:00:00.000Z');

    const s3sig = buildNoResultsSignal({
      host: 'other.club.test',
      guid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      queries: ['park flyer'],
      sector: 'rc airplane',
      at: '2026-10-25T22:00:00.000Z',
    });
    ledger = upsertSectorLedger(ledger, s3sig);
    assert.equal(ledger.sectors['rc airplane'].count, 3);
    assert.equal(ledger.sectors['rc airplane'].pages.length, 2);
  });

  it('recordNoResultsIfEmpty writes GUID signal and ledger when partCount=0', async () => {
    await s3.putObject({
      Key: `${HOST}/${GUID}/searches.json`,
      Body: `${JSON.stringify({
        queries: [
          { q: 'Volantex Sport Cub S2', intent: 'page', maxResults: 10 },
          { q: 'Xpilot', intent: 'page', maxResults: 10 },
        ],
        searchid: SEARCHID,
      })}\n`,
    });

    const out = await recordNoResultsIfEmpty({
      host: HOST,
      guid: GUID,
      searchid: SEARCHID,
      partCount: 0,
      bucket: 'test-a-clubs',
      now: '2026-10-25T20:35:00.000Z',
      putObject: s3.putObject,
      getObject: s3.getObject,
      getObjectAnnotation: async ({ Key }) => {
        if (Key === `${HOST}/${GUID}/`) {
          return {
            AnnotationPayload: JSON.stringify({
              selection: { product_types: ['RTF beginner RC airplane'] },
            }),
          };
        }
        if (Key === `${HOST}/`) {
          return {
            AnnotationPayload: JSON.stringify({
              affiliate_opportunities: [{ category: 'Hobbies', brands: [], hook: 'x' }],
            }),
          };
        }
        const err = new Error('missing');
        err.name = 'NoSuchKey';
        throw err;
      },
    });
    assert.equal(out.recorded, true);
    assert.equal(out.signalKey, noResultsSignalKey(HOST, GUID));
    assert.equal(out.ledgerKey, sectorLedgerKey());
    assert.equal(out.sector, 'rtf beginner rc airplane');

    const signalObj = await s3.getObject({ Key: out.signalKey });
    const signal = JSON.parse(signalObj.Body.toString('utf8'));
    assert.equal(signal.schema, SIGNAL_SCHEMA);
    assert.equal(signal.message, 'need more vendors in sector rtf beginner rc airplane');
    assert.ok(signal.queries.includes('Volantex Sport Cub S2'));

    const ledgerObj = await s3.getObject({ Key: out.ledgerKey });
    const ledger = JSON.parse(ledgerObj.Body.toString('utf8'));
    assert.equal(ledger.sectors['rtf beginner rc airplane'].count, 1);

    const again = await recordNoResultsIfEmpty({
      host: HOST,
      guid: GUID,
      searchid: SEARCHID,
      partCount: 0,
      bucket: 'test-a-clubs',
      now: '2026-10-25T21:00:00.000Z',
      putObject: s3.putObject,
      getObject: s3.getObject,
      getObjectAnnotation: async () => ({
        AnnotationPayload: JSON.stringify({
          selection: { product_types: ['RTF beginner RC airplane'] },
        }),
      }),
    });
    assert.equal(again.recorded, true);
    const ledger2 = JSON.parse(
      (await s3.getObject({ Key: out.ledgerKey })).Body.toString('utf8'),
    );
    assert.equal(
      ledger2.sectors['rtf beginner rc airplane'].count,
      2,
      'repeat no-result for same sector increments count',
    );
  });

  it('recordNoResultsIfEmpty skips when live already has parts', async () => {
    const out = await recordNoResultsIfEmpty({
      host: HOST,
      guid: GUID,
      live: [{ partId: 'p1' }],
      putObject: s3.putObject,
      getObject: s3.getObject,
    });
    assert.equal(out.recorded, false);
    assert.equal(out.reason, 'has_parts');
    assert.equal(s3.objects.has(noResultsSignalKey(HOST, GUID)), false);
  });

  it('hasresults flip with empty live writes no-results feedback', async () => {
    await s3.putObject({
      Key: `${HOST}/${GUID}/`,
      Body: Buffer.alloc(0),
      Metadata: {
        hasresults: '0',
        enabled: '0',
        annotated: '1',
        lastmod: '2026-10-25T12:00:00.000Z',
      },
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/live.json`,
      Body: '[]\n',
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/searches.json`,
      Body: `${JSON.stringify({
        queries: [{ q: 'Volantex Sport Cub S2', maxResults: 10 }],
        searchid: SEARCHID,
      })}\n`,
    });
    await s3.putObject({
      Key: `${HOST}/${GUID}/search-fanout.json`,
      Body: `${JSON.stringify({
        searchid: SEARCHID,
        queued: ['sql'],
        at: 't',
      })}\n`,
    });

    const flip = await recordSearchTerminal({
      bucket: 'test-a-clubs',
      putObject: s3.putObject,
      getObject: s3.getObject,
      headObject: s3.headObject,
      copyObject: s3.copyObject,
      listObjectsV2: s3.listObjectsV2,
      getObjectTagging: async () => ({ TagSet: [] }),
      putObjectTagging: async () => ({}),
      getObjectAnnotation: async ({ Key }) => {
        if (String(Key).endsWith(`${GUID}/`)) {
          return {
            AnnotationPayload: JSON.stringify({
              selection: { product_types: ['RC airplane'] },
            }),
          };
        }
        return {
          AnnotationPayload: JSON.stringify({
            affiliate_opportunities: [{ category: 'Hobbies', brands: [], hook: 'x' }],
          }),
        };
      },
      now: '2026-10-25T20:40:00.000Z',
      hostkey: HOST,
      guid: GUID,
      searchid: SEARCHID,
      source: 'sql',
      status: 'serviced',
      products: 0,
    });
    assert.equal(flip.hasresults, true);
    assert.ok(
      flip.flip && flip.flip.noResults && flip.flip.noResults.recorded === true,
      'flip carries noResults.recorded',
    );
    assert.ok(
      s3.objects.has(noResultsSignalKey(HOST, GUID)),
      'GUID feedback/no-results.json written',
    );
    assert.ok(s3.objects.has(sectorLedgerKey()), 'sector ledger written');
    const signal = JSON.parse(
      s3.objects.get(noResultsSignalKey(HOST, GUID)).Body.toString('utf8'),
    );
    assert.equal(signal.message, 'need more vendors in sector rc airplane');
  });

  it('feedback/ and _ops/ keys are excluded from annotator change events', () => {
    assert.equal(isExcludedKey(`${HOST}/${GUID}/feedback/no-results.json`), true);
    assert.equal(isExcludedKey('_ops/need-vendors-by-sector.json'), true);
    assert.equal(isExcludedKey(`${HOST}/${GUID}/searches.json`), false);
  });

  it('annotator docs state enough searches + 0 results valid + providers never widen', () => {
    const doc = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'redqueen-annotations.md'),
      'utf8',
    );
    assert.match(doc, /FR #5047/);
    assert.match(doc, /enough searches/i);
    assert.match(doc, /0 results is (still )?a valid/i);
    assert.match(doc, /providers never widen/i);
    assert.match(doc, /need more vendors/i);
    assert.match(doc, /feedback\/no-results\.json/);
    assert.match(doc, /_ops\/need-vendors-by-sector\.json/);
  });

  it('affiliate and merchant docs point agents at the sector ledger', () => {
    const aff = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'a-affiliates.md'),
      'utf8',
    );
    const mer = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'a-merchants.md'),
      'utf8',
    );
    const seed = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'redqueen',
        'affiliate-agent',
        'seed',
        'a-affiliates',
        'AGENTS.md',
      ),
      'utf8',
    );
    for (const text of [aff, mer, seed]) {
      assert.match(text, /FR #5047/);
      assert.match(text, /need-vendors-by-sector\.json/);
      assert.match(text, /need more vendors/i);
    }
  });
});
