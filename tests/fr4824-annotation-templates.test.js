'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { hostMarkerKey, guidMarkerKey } = require('../parts-gateway/src/aClubsKeys');
const { processFolderEvent, annotationNeed } = require('../redqueen/src/annotate');
const {
  parseReviewJson,
  validateHostAnnotation,
  validatePageAnnotation,
  exampleHostV1,
  examplePageV1,
  HOST_SCHEMA,
  PAGE_SCHEMA,
} = require('../redqueen/src/annotationSchemas');
const { coerceReview, reviewWithGrokThenCursor } = require('../redqueen/src/reviewers');
const { pageOverlapsHost } = require('../redqueen/src/pageOverlap');
const { buildSearchesDoc } = require('../redqueen/src/guidSearch');
const { filterPartsByPage } = require('../redqueen/src/pageSelect');
const { selectWithinCap } = require('../shared/widgets/agentIngest');

const GUID_A = '8504174c-f21f-4fe0-b8eb-98e7d7ceaed0';
const GUID_B = 'de986521-72d8-4d55-8da3-12ca524d8d74';

const IN_FIXTURE = [
  { partNumber: '761-14', title: 'VOLANTEXRC Sport Cub S2 761-14 RTF', price: 89, currency: 'GBP', score: 1 },
  { partNumber: 'EFLU53550Y', title: 'E-flite UMX Waco BNF Basic', price: 120, currency: 'GBP', score: 1 },
  { partNumber: 'LIPO4S', title: '4S 3200mAh LiPo XT60 pack', price: 35, currency: 'GBP', score: 1 },
  { partNumber: 'CA1', title: 'CA superglue 2-pack', price: 6, currency: 'GBP', score: 1 },
  { partNumber: 'RF1', title: 'RealFlight Evolution simulator', price: 140, currency: 'GBP', score: 2 },
  { partNumber: 'NITRO1', title: 'OS nitro glow engine .46', price: 160, currency: 'GBP', score: 2 },
  { partNumber: 'KIT1', title: 'balsa kit requiring assembly', price: 90, currency: 'GBP', score: 1 },
  { partNumber: 'CAR1', title: 'RC car touring 1/10', price: 200, currency: 'GBP', score: 3 },
  { partNumber: 'WAR1', title: '1.8m scale warbird giant', price: 400, currency: 'GBP', score: 2 },
];

function deps(s3, extra) {
  return {
    headObject: s3.headObject,
    getObject: s3.getObject,
    putObject: s3.putObject,
    listObjectsV2: s3.listObjectsV2,
    copyObject: s3.copyObject,
    putObjectAnnotation: s3.putObjectAnnotation,
    getObjectAnnotation: s3.getObjectAnnotation,
    listObjectAnnotations: s3.listObjectAnnotations,
    bucket: 'a-clubs',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        Buffer.from('<html><head><title>Offers</title></head><body><h1>Offers</h1><p>Sport Cub</p></body></html>'),
    }),
    ...extra,
  };
}

async function seed(s3, host, guids) {
  const createdAt = '2026-10-18T11:00:00.000Z';
  await s3.putObject({
    Key: hostMarkerKey(host),
    Body: Buffer.alloc(0),
    Metadata: { host, hostkey: host, lastmod: createdAt, annotated: '0' },
  });
  for (const g of guids) {
    await s3.putObject({
      Key: guidMarkerKey(host, g),
      Body: Buffer.alloc(0),
      Metadata: { uri: '/membersproductrequests', lastmod: createdAt, annotated: '0' },
    });
  }
}

describe('FR #4824 schema validation', () => {
  it('valid host and page examples pass', () => {
    assert.equal(validateHostAnnotation(exampleHostV1()).ok, true);
    assert.equal(validatePageAnnotation(examplePageV1()).ok, true);
  });

  it('missing field, extra property and free-text fail', () => {
    const host = exampleHostV1();
    delete host.about;
    assert.equal(validateHostAnnotation(host).ok, false);
    assert.equal(validateHostAnnotation(exampleHostV1({ extra: 'nope' })).ok, false);
    assert.equal(parseReviewJson('not json at all').ok, false);
    const junk = coerceReview('I will write a brief later', 'grok');
    assert.equal(junk.usable, false);
  });
});

describe('FR #4824 overlap rules', () => {
  it('rejects page_description that restates host about', () => {
    const host = exampleHostV1();
    const page = examplePageV1({
      page_description: host.about,
      page_purpose: host.about,
    });
    const r = pageOverlapsHost(page, host);
    assert.equal(r.ok, false);
    assert.ok(r.reasons.includes('page_repeats_host_description'));
  });

  it('rejects page keywords that are mostly host keywords', () => {
    const host = exampleHostV1();
    const page = examplePageV1({
      page_keywords: ['rc airplane', 'fixed wing', 'trainer', 'bmfa club', 'lipo'],
    });
    const r = pageOverlapsHost(page, host);
    assert.equal(r.ok, false);
    assert.ok(r.reasons.includes('page_keywords_repeat_host'));
  });

  it('drops host exclusions and rejects host-topic negatives', () => {
    const host = exampleHostV1({
      exclusions: ['rc car'],
      keywords: ['realflight', 'nitro'],
    });
    const page = examplePageV1();
    page.selection.page_exclusions = ['rc car', 'realflight'];
    const r = pageOverlapsHost(page, host);
    assert.ok(r.page_exclusions.includes('rc car') === false);
    assert.equal(r.ok, false);
  });

  it('rejects host identity in a query', () => {
    const host = exampleHostV1();
    const page = examplePageV1({
      search_queries: [
        { q: 'RC plane', intent: 'page', maxResults: 10 },
        { q: 'Sport Cub L40 4BA RTF', intent: 'page', maxResults: 10 },
      ],
    });
    const r = pageOverlapsHost(page, host);
    assert.equal(r.ok, false);
    assert.ok(r.reasons.includes('page_contains_host_identity'));
  });

  it('rejects a sibling copy with a different URI', () => {
    const host = exampleHostV1();
    const page = examplePageV1({ uri: '/weekly' });
    const sib = examplePageV1({ uri: '/other', guid: GUID_B });
    const r = pageOverlapsHost(page, host, { siblings: [{ uri: '/other', page: sib }] });
    assert.equal(r.ok, false);
    assert.ok(r.reasons.includes('page_copies_sibling'));
  });
});

describe('FR #4824 searches.json from page+host', () => {
  it('queries from page only; exclude host+page; ISO market; no identity in q', () => {
    const host = exampleHostV1();
    const page = examplePageV1();
    const { doc } = buildSearchesDoc({
      host,
      page,
      existing: { queries: [], exclude: [] },
      fullTier: false,
      now: '2026-10-24T16:00:00.000Z',
    });
    // FR #5290: free cap keeps generics first; Sport Cub may be truncated at cap 3.
    assert.ok(
      doc.queries.some((q) => /RC plane|RTF trainer|paint station|Sport Cub|RC aircraft/i.test(q.q)),
      JSON.stringify(doc.queries),
    );
    assert.ok(doc.queries.some((q) => !q.sku && !q.model), 'expected a generic row');
    assert.ok(doc.exclude.some((e) => e.match === 'rc car' && e.reason === 'host'));
    assert.ok(doc.exclude.some((e) => e.match === 'kit requiring assembly' && e.reason === 'page'));
    assert.equal(doc.market, 'GB');
    assert.equal(doc.currency, 'GBP');
    assert.equal(doc.annotationSchema, PAGE_SCHEMA);
    for (const q of doc.queries) {
      assert.equal(/Lathom|Ormskirk|L40/.test(q.q), false);
    }
  });
});

describe('FR #4824 selector', () => {
  it('two page briefs pick different parts; host exclusions dropped; SKU first', () => {
    const host = exampleHostV1();
    const aircraft = examplePageV1({
      guid: GUID_A,
      page_keywords: ['sport cub rtf', 'umx waco', 'beginner plane'],
      selection: {
        ...examplePageV1().selection,
        product_types: ['RTF', 'airplane', 'waco', 'cub'],
        must_have: [],
        page_exclusions: ['kit requiring assembly'],
        price_band: { currency: 'GBP', min: 3, max: 220 },
      },
    });
    const consumables = examplePageV1({
      guid: GUID_B,
      uri: '/membersproductrequests',
      page_purpose: 'This GUID is the battery and glue slice of the same weekly gift list.',
      page_description: 'LiPo packs and CA glue requested next to the aircraft, not the airframes.',
      page_keywords: ['4s lipo', 'xt60 pack', 'ca glue'],
      search_queries: [{ q: '4S 3200mAh LiPo XT60', intent: 'page', maxResults: 10 }],
      selection: {
        product_types: ['LiPo', 'glue', 'CA'],
        categories: [],
        must_have: [],
        nice_to_have: ['XT60'],
        brands: ['ELFY'],
        models: [{ brand: 'ELFY', model: '4S 3200', sku: 'LIPO4S' }],
        size: {},
        price_band: { currency: 'GBP', min: 3, max: 80 },
        page_exclusions: ['giant scale'],
        ranking_hints: ['exact listed SKU first'],
      },
    });
    const a = filterPartsByPage(IN_FIXTURE, { page: aircraft, host });
    const b = filterPartsByPage(IN_FIXTURE, { page: consumables, host });
    assert.equal(a.some((p) => p.partNumber === 'CAR1'), false);
    assert.equal(b.some((p) => p.partNumber === 'CAR1'), false);
    assert.equal(a.some((p) => p.partNumber === 'WAR1'), false);
    const idsA = a.map((p) => p.partNumber);
    const idsB = b.map((p) => p.partNumber);
    assert.ok(idsA.includes('761-14'));
    assert.ok(idsB.includes('LIPO4S') || idsB.includes('CA1'));
    assert.ok(idsA.join() !== idsB.join());
    const ranked = selectWithinCap(a, 10, { page: aircraft, host });
    assert.equal(ranked[0].partNumber, '761-14');
    const legacy = filterPartsByPage(IN_FIXTURE, {});
    assert.equal(legacy.length, IN_FIXTURE.length);
  });
});

describe('FR #4824 annotate writes only valid JSON', () => {
  it('non-JSON is retried once then retry with nothing written', async () => {
    const s3 = createMemoryS3();
    const host = 'www.mymodelflyingclub.co.uk';
    await seed(s3, host, [GUID_A]);
    let hostCalls = 0;
    let writes = 0;
    const real = s3.putObjectAnnotation;
    s3.putObjectAnnotation = async (input) => {
      writes += 1;
      return real(input);
    };
    const result = await reviewWithGrokThenCursor({
      kind: 'host',
      host,
      hostkey: host,
      pageText: 'club home text for the reviewer',
      pageHead: { title: 'Club' },
      tryGrok: async () => {
        hostCalls += 1;
        return { ok: true, text: 'I will browse the about page first' };
      },
      tryCursor: async () => ({ ok: false, detail: 'skip' }),
    });
    assert.equal(result.usable, false);
    assert.equal(hostCalls, 2);

    const ev = await processFolderEvent(
      deps(s3, {
        event: { hostkey: host, host },
        reviewHost: async () => ({
          model: 'grok',
          usable: false,
          schema_invalid: true,
          detail: 'not_json',
        }),
        reviewGuid: async () => {
          throw new Error('guid_should_not_run');
        },
      }),
    );
    assert.equal(ev.action, 'retry');
    assert.equal(ev.detail, 'host_schema_invalid');
    assert.equal(writes, 0);
  });

  it('host first: invalid host skips GUID review', async () => {
    const s3 = createMemoryS3();
    const host = 'www.mymodelflyingclub.co.uk';
    await seed(s3, host, [GUID_A]);
    let guid = 0;
    const ev = await processFolderEvent(
      deps(s3, {
        event: { hostkey: host, host },
        reviewHost: async () => ({ model: 'grok', summary: 'short' }),
        reviewGuid: async () => {
          guid += 1;
          return examplePageV1();
        },
      }),
    );
    assert.equal(ev.action, 'retry');
    assert.equal(guid, 0);
  });

  it('legacy stored host without schema needs update', () => {
    assert.equal(
      annotationNeed(
        { annotated: '1', lastmod: 'a', lastupdate: 'b' },
        { stored: { summary: 'old' }, expectSchema: HOST_SCHEMA },
      ),
      'update',
    );
    assert.equal(
      annotationNeed(
        { annotated: '1', lastmod: 'a', lastupdate: 'z' },
        { stored: exampleHostV1(), expectSchema: HOST_SCHEMA },
      ),
      'skip',
    );
  });

  it('valid templates are stored as v1 and searches rebuild', async () => {
    const s3 = createMemoryS3();
    const host = 'www.mymodelflyingclub.co.uk';
    await seed(s3, host, [GUID_A]);
    const ev = await processFolderEvent(
      deps(s3, {
        event: { hostkey: host, host },
        reviewHost: async () => exampleHostV1({ host }),
        reviewGuid: async () => examplePageV1({ guid: GUID_A }),
      }),
    );
    assert.equal(ev.action, 'host_processed');
    assert.equal(ev.host, 'annotated');
    assert.equal(ev.guids[0].action, 'guid_annotated');
    const hostAnn = await s3.getObjectAnnotation({
      Key: hostMarkerKey(host),
      AnnotationName: 'annotation',
    });
    const hostDoc = JSON.parse(hostAnn.AnnotationPayload);
    assert.equal(hostDoc.schema, HOST_SCHEMA);
    const pageAnn = await s3.getObjectAnnotation({
      Key: guidMarkerKey(host, GUID_A),
      AnnotationName: 'annotation',
    });
    const pageDoc = JSON.parse(pageAnn.AnnotationPayload);
    assert.equal(pageDoc.schema, PAGE_SCHEMA);
    const searches = JSON.parse(
      (await s3.getObject({ Key: `${host}/${GUID_A}/searches.json` })).Body.toString('utf8'),
    );
    assert.equal(searches.annotationSchema, PAGE_SCHEMA);
    assert.equal(/L40 4BA/.test(JSON.stringify(searches.queries)), false);
  });
});
