'use strict';

/**
 * FR #4563: clean q (no postcode/town/currency), market+currency fields,
 * searches.json searchid agrees with search-fanout after /search.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildSearchesDoc } = require('../redqueen/src/guidSearch');
const {
  keywordsOnly,
  normalizeMarketCurrency,
  ebayMarketplaceFromMarket,
} = require('../shared/search/cleanSearchQuery');
const { keywordsFromAgentMsg } = require('../shared/search/keywordsFromAgentMsg');
const { handleAgentSearch } = require('../entry/src/agentSearch');

const MARKET =
  'United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk)';

describe('FR #4563 clean q + market/currency fields', () => {
  it('GUID review with postcode produces clean q and GB/GBP fields', () => {
    const { doc } = buildSearchesDoc({
      review: {
        suggestedQueries: [
          `E-flite UMX Conscendo ${MARKET} GBP`,
          'Radian trainer L40 4BA',
        ],
      },
      steering: { market: MARKET, currency: 'GBP' },
      existing: { queries: [], exclude: [] },
      now: '2026-10-20T16:00:00.000Z',
    });
    for (const row of doc.queries) {
      assert.equal(row.q.includes('United Kingdom'), false);
      assert.equal(row.q.includes('Lathom'), false);
      assert.equal(row.q.includes('Ormskirk'), false);
      assert.equal(row.q.includes('L40'), false);
      assert.equal(/\bGBP\b/.test(row.q), false);
      assert.equal(row.q.includes('postcode'), false);
    }
    assert.equal(doc.queries[0].q, 'E-flite UMX Conscendo');
    assert.equal(doc.queries[1].q, 'Radian trainer');
    assert.equal(doc.market, 'GB');
    assert.equal(doc.currency, 'GBP');
  });

  it('keywordsOnly strips location even when market arg is empty', () => {
    const q = keywordsOnly(
      `trainer kits ${MARKET} GBP`,
      '',
      '',
    );
    assert.equal(q.includes('United Kingdom'), false);
    assert.equal(q.includes('L40'), false);
    assert.equal(/\bGBP\b/.test(q), false);
    assert.equal(q, 'trainer kits');
  });

  it('keywordsFromAgentMsg cleans dirty queries at fan-out', () => {
    const q = keywordsFromAgentMsg({
      queries: [{ q: `balsa ${MARKET} GBP` }],
      market: MARKET,
      currency: 'GBP',
    });
    assert.equal(q, 'balsa');
  });

  it('normalizeMarketCurrency and ebay marketplace map', () => {
    assert.deepEqual(normalizeMarketCurrency({ market: MARKET, currency: 'GBP' }), {
      market: 'GB',
      currency: 'GBP',
    });
    assert.equal(ebayMarketplaceFromMarket('GB'), 'EBAY_GB');
    assert.equal(ebayMarketplaceFromMarket('US'), 'EBAY_US');
  });
});

describe('FR #4563 searches.json searchid sync with fan-out', () => {
  it('new /search updates searches.json searchid to match fan-out', async () => {
    /** @type {Map<string, Buffer>} */
    const objects = new Map();
    objects.set(
      'www.mymodelflyingclub.co.uk/',
      Buffer.from(''),
    );
    objects.set(
      'www.mymodelflyingclub.co.uk/de986521-72d8-4d55-8da3-12ca524d8d74/',
      Buffer.from(''),
    );
    objects.set(
      'www.mymodelflyingclub.co.uk/de986521-72d8-4d55-8da3-12ca524d8d74/searches.json',
      Buffer.from(
        `${JSON.stringify({
          queries: [{ q: 'old dirty ' + MARKET, intent: 'page', maxResults: 10 }],
          exclude: [],
          searchid: 'srch_1bd6fe0e6722cfbd04dd',
          market: MARKET,
        })}\n`,
        'utf8',
      ),
    );

    const FAKE_KEY = 'FAKE_agent_key_for_tests_only';
    const host = 'www.mymodelflyingclub.co.uk';
    const guid = 'de986521-72d8-4d55-8da3-12ca524d8d74';
    const sent = [];
    const notFound = () => {
      const err = new Error('NoSuchKey');
      err.name = 'NoSuchKey';
      err.$metadata = { httpStatusCode: 404 };
      return err;
    };
    const result = await handleAgentSearch({
      event: {
        headers: { 'x-agent-api-key': FAKE_KEY },
        body: {
          hostkey: host,
          guid,
          queries: [{ q: 'E-flite UMX', intent: 'page', maxResults: 10 }],
          exclude: [],
          market: MARKET,
          currency: 'GBP',
        },
      },
      env: { A_SEARCH_AGENT_API_KEY: FAKE_KEY },
      enabled: () => ['ebay'],
      loadRegistry: () => ({
        sources: [
          { id: 'ebay', kind: 'live', awsSearch: true, queueEnv: 'SQS_EBAY_URL' },
        ],
      }),
      newSearchId: () => 'srch_677ea35b21e320ef2f63',
      sendMessage: async (payload) => {
        sent.push(payload);
      },
      headObject: async ({ Key }) => {
        if (Key === `${host}/`) return { Metadata: { userid: 'ABCD1234' } };
        if (Key === `${host}/${guid}/`) return { Metadata: {} };
        throw notFound();
      },
      getObject: async ({ Key }) => {
        if (!objects.has(Key)) throw notFound();
        return { Body: objects.get(Key) };
      },
      putObject: async ({ Key, Body }) => {
        objects.set(Key, Buffer.isBuffer(Body) ? Body : Buffer.from(String(Body)));
      },
    });

    assert.equal(result.searchid, 'srch_677ea35b21e320ef2f63');
    assert.equal(result.idempotent, false);
    assert.ok(sent.length >= 1);
    assert.equal(sent[0].market, 'GB');
    assert.equal(sent[0].currency, 'GBP');

    const fanout = JSON.parse(
      objects
        .get(
          'www.mymodelflyingclub.co.uk/de986521-72d8-4d55-8da3-12ca524d8d74/search-fanout.json',
        )
        .toString('utf8'),
    );
    const searches = JSON.parse(
      objects
        .get(
          'www.mymodelflyingclub.co.uk/de986521-72d8-4d55-8da3-12ca524d8d74/searches.json',
        )
        .toString('utf8'),
    );
    assert.equal(fanout.searchid, 'srch_677ea35b21e320ef2f63');
    assert.equal(searches.searchid, fanout.searchid);
    assert.equal(searches.market, 'GB');
    assert.equal(searches.currency, 'GBP');
  });
});
