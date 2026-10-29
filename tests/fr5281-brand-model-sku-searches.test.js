'use strict';

/**
 * FR #5281: searches.json query rows carry brand/model/sku from annotation
 * selection through fan-out to providers (SQL gates already read them).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildSearchesDoc } = require('../redqueen/src/guidSearch');
const {
  examplePageV1,
  validatePageAnnotation,
  liftPageReview,
  PAGE_SCHEMA,
} = require('../redqueen/src/annotationSchemas');
const { boundQueries } = require('../shared/widgets/agentWidgetContext');
const { extractBrandModelGateTokens } = require('../providers/local/sql/src/queryParts');
const { keywordsFromAgentMsg } = require('../shared/search/keywordsFromAgentMsg');
const { handleAgentSearch } = require('../entry/src/agentSearch');

const EXAMPLES = [
  {
    brand: 'VOLANTEXRC',
    model: 'Sport Cub S2 3CH RTF Xpilot',
    sku: '761-14',
  },
  {
    brand: 'HobbyZone',
    model: 'Sport Cub S 2 615mm RTF SAFE telemetry',
    sku: 'HBZ444000',
  },
  {
    brand: 'E-flite',
    model: 'UMX Waco Yellow BNF Basic AS3X SAFE park flying',
    sku: 'EFLU53550Y',
  },
];

function pageWithExamples() {
  return examplePageV1({
    selection: {
      product_types: ['RTF beginner RC airplane'],
      categories: ['Sport Cub trainers'],
      must_have: ['RTF or BNF'],
      nice_to_have: ['SAFE'],
      brands: ['VOLANTEXRC', 'HobbyZone', 'E-flite'],
      models: EXAMPLES.map((e) => ({
        brand: e.brand,
        model: e.model,
        sku: e.sku,
      })),
      size: {},
      price_band: { currency: 'GBP', min: 3, max: 220 },
      page_exclusions: [],
      ranking_hints: [],
    },
    search_queries: [
      { q: 'RC plane', intent: 'page', maxResults: 10 },
      ...EXAMPLES.map((e) => ({
        q: [e.brand, e.model, e.sku].join(' '),
        intent: 'page',
        maxResults: 10,
        brand: e.brand,
        model: e.model,
        sku: e.sku,
      })),
    ],
  });
}

describe('FR #5281 brand/model/sku on searches.json and fan-out', () => {
  it('page schema accepts brand/model/sku on search_queries', () => {
    const page = pageWithExamples();
    const v = validatePageAnnotation(page);
    assert.equal(v.ok, true, JSON.stringify(v.errors || v));
  });

  it('boundQueries keeps brand/model/sku/brands/models', () => {
    const rows = boundQueries(
      [
        {
          q: 'VOLANTEXRC Sport Cub S2 761-14',
          intent: 'page',
          maxResults: 10,
          brand: 'VOLANTEXRC',
          model: 'Sport Cub S2',
          sku: '761-14',
          brands: ['VOLANTEXRC'],
          models: [{ brand: 'VOLANTEXRC', model: 'Sport Cub S2', sku: '761-14' }],
        },
      ],
      5,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].brand, 'VOLANTEXRC');
    assert.equal(rows[0].model, 'Sport Cub S2');
    assert.equal(rows[0].sku, '761-14');
    assert.deepEqual(rows[0].brands, ['VOLANTEXRC']);
    assert.equal(rows[0].models[0].sku, '761-14');
  });

  it('buildSearchesDoc carries the three example brand/model/sku rows', () => {
    const page = pageWithExamples();
    const { doc } = buildSearchesDoc({
      page,
      host: { market: { country: 'GB', currency: 'GBP' } },
      fullTier: true,
      existing: { queries: [], exclude: [] },
      now: '2026-10-29T08:00:00.000Z',
    });
    assert.ok(doc.queries.length >= 3);
    for (const ex of EXAMPLES) {
      const hit = doc.queries.find(
        (q) =>
          String(q.sku || '') === ex.sku ||
          (String(q.brand || '') === ex.brand &&
            String(q.q || '').includes(ex.sku)),
      );
      assert.ok(hit, `missing row for ${ex.sku}: ${JSON.stringify(doc.queries)}`);
      assert.equal(hit.brand, ex.brand);
      assert.equal(hit.model, ex.model);
      assert.equal(hit.sku, ex.sku);
      assert.ok(String(hit.q).includes(ex.brand) || String(hit.q).includes(ex.sku));
    }
  });

  it('SQL extractBrandModelGateTokens uses structured query fields', () => {
    const { doc } = buildSearchesDoc({
      page: pageWithExamples(),
      host: { market: { country: 'GB', currency: 'GBP' } },
      fullTier: true,
      existing: { queries: [], exclude: [] },
    });
    const msg = { queries: doc.queries, market: 'GB', currency: 'GBP' };
    const gates = extractBrandModelGateTokens(msg);
    const joined = gates.join(' | ').toLowerCase();
    assert.match(joined, /volantex/);
    assert.match(joined, /761-14/);
    assert.match(joined, /hbz444000/);
    assert.match(joined, /eflu53550y/);
  });

  it('live keywordsFromAgentMsg still uses q only (no crash)', () => {
    const q = keywordsFromAgentMsg({
      queries: [
        {
          q: 'VOLANTEXRC Sport Cub S2 761-14',
          brand: 'VOLANTEXRC',
          model: 'Sport Cub S2',
          sku: '761-14',
        },
      ],
      market: 'GB',
      currency: 'GBP',
    });
    assert.match(q, /VOLANTEXRC/);
    assert.match(q, /761-14/);
  });

  it('POST /search fan-out SQS payload keeps brand/model/sku on queries', async () => {
    const sent = [];
    const host = 'www.mymodelflyingclub.co.uk';
    const guid = '8504174c-f21f-4fe0-b8eb-98e7d7ceaed0';
    const page = pageWithExamples();
    const { doc } = buildSearchesDoc({
      page,
      host: { market: { country: 'GB', currency: 'GBP' } },
      fullTier: true,
      existing: { queries: [], exclude: [] },
    });
    const meta = {};
    meta[`${host}/`] = { userid: '0123456C', hostkey: host };
    meta[`${host}/${guid}/`] = { uri: '/x', annotated: '1' };
    await handleAgentSearch({
      event: {
        body: {
          hostkey: host,
          guid,
          queries: doc.queries,
          exclude: [],
          market: 'GB',
          currency: 'GBP',
          brands: doc.brands,
          models: doc.models,
        },
      },
      env: {
        SQS_EBAY_LIVE_URL: 'https://sqs.example/ebay.fifo',
        SQS_DB_BACKED_LIVE_URL: 'https://sqs.example/db',
      },
      headObject: async ({ Key }) => {
        if (!(Key in meta)) {
          const err = new Error('missing');
          err.name = 'NotFound';
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        }
        return { Metadata: meta[Key] };
      },
      putObject: async () => ({}),
      getObject: async () => ({ Body: Buffer.from('{}') }),
      sendMessage: async (payload) => {
        sent.push(payload);
      },
      enabled: () => ['ebay'],
      loadRegistry: () => ({
        sources: [{ id: 'ebay', kind: 'live', awsSearch: true, queueEnv: 'SQS_EBAY_URL' }],
      }),
      checkAffiliatesEnabled: false,
      newSearchId: () => 'srch_5281_test',
    });
    assert.ok(sent.length >= 1, 'expected at least one enqueue');
    for (const payload of sent) {
      assert.ok(Array.isArray(payload.queries));
      const vol = payload.queries.find((q) => q && q.sku === '761-14');
      assert.ok(vol, JSON.stringify(payload.queries));
      assert.equal(vol.brand, 'VOLANTEXRC');
      assert.equal(vol.model, EXAMPLES[0].model);
      assert.ok(Array.isArray(payload.brands));
      assert.ok(payload.brands.includes('VOLANTEXRC'));
    }
  });

  it('liftPageReview fallback keeps steering models/brands', () => {
    const lifted = liftPageReview(
      {
        summary: 'Weekly specials for Sport Cub and UMX Waco',
        intent: 'gift shortlist',
        suggestedQueries: ['VOLANTEXRC Sport Cub S2 761-14'],
        steering: {
          brands: ['VOLANTEXRC', 'HobbyZone'],
          models: [
            { brand: 'VOLANTEXRC', model: 'Sport Cub S2', sku: '761-14' },
            { brand: 'HobbyZone', model: 'Sport Cub S', sku: 'HBZ444000' },
          ],
        },
      },
      { guid: '8504174c-f21f-4fe0-b8eb-98e7d7ceaed0', uri: '/x' },
    );
    assert.equal(lifted.schema, PAGE_SCHEMA);
    assert.deepEqual(lifted.selection.brands, ['VOLANTEXRC', 'HobbyZone']);
    assert.equal(lifted.selection.models.length, 2);
    assert.equal(lifted.selection.models[0].sku, '761-14');
  });

  it('docs pin FR #5281 structured query fields', () => {
    const fanout = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'search-fanout.md'),
      'utf8',
    );
    assert.match(fanout, /5281|#5281/);
    assert.match(fanout, /brand|sku/i);
  });
});
