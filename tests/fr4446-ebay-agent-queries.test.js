'use strict';

/**
 * FR #4446: eBay live search must use agent /search `queries` / `exclude`
 * (searches.json shape). Never call Browse with a blank `q` / `q=%20`.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  searchEbay,
  keywordsFromMsg,
  queryTextsFromMsg,
  buildEbayBrowseQ,
} = require('../providers/live/ebay/src/search');

const fixturePath = path.join(
  __dirname,
  '..',
  'providers',
  'live',
  'ebay',
  'fixtures',
  'item-summary-ok.json',
);

const credEnv = {
  A_SEARCH_ENV: 'live',
  EBAY_CLIENT_ID: 'FAKE_ebay_client_id',
  EBAY_CLIENT_SECRET: 'FAKE_ebay_client_secret',
  EBAY_MARKETPLACE_ID: 'EBAY_GB',
  EBAY_ENV: 'production',
  EBAY_CAMPAIGN_ID: 'FAKE_ebay_campaign',
};

describe('FR #4446 eBay agent queries', () => {
  it('queryTextsFromMsg reads queries[] (string or {q}) and keeps legacy q', () => {
    assert.deepEqual(
      queryTextsFromMsg({
        queries: [
          { q: 'model aircraft kit', intent: 'relevant' },
          'glow engine',
          { q: '  ' },
        ],
      }),
      ['model aircraft kit', 'glow engine'],
    );
    assert.deepEqual(queryTextsFromMsg({ q: 'headphones' }), ['headphones']);
    assert.deepEqual(queryTextsFromMsg({ searchterms: ['a', 'b'] }), ['a b']);
    assert.deepEqual(queryTextsFromMsg({ queries: [], q: '' }), []);
  });

  it('buildEbayBrowseQ appends -term exclusions (min 3 chars)', () => {
    assert.equal(
      buildEbayBrowseQ('model aircraft', [
        { match: 'fuel' },
        { match: 'IC' },
        { partId: 'p1' },
        'nitro',
      ]),
      'model aircraft -fuel -nitro',
    );
  });

  it('agent /search message: Browse q comes from queries and exclude, never blank', async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const urls = [];
    const products = await searchEbay(
      {
        searchId: 'srch_fr4446',
        userId: 'MMFC0001',
        env: 'live',
        source: 'ebay',
        hostkey: 'www.mymodelflyingclub.co.uk',
        guid: 'de986521-72d8-4d55-8da3-12ca524d8d74',
        queries: [{ q: 'model aircraft kit' }, { q: 'RC glider' }],
        exclude: [{ match: 'fuel' }, { match: 'nitro' }],
      },
      {
        env: credEnv,
        accessToken: 'FAKE_access_token',
        httpRequest: async (req) => {
          urls.push(req.url);
          return fixture;
        },
      },
    );

    assert.ok(urls.length >= 1);
    for (const url of urls) {
      const u = new URL(url);
      const q = u.searchParams.get('q');
      assert.ok(q && q.trim(), 'q must not be blank');
      assert.notEqual(q, ' ');
      assert.match(q, /model aircraft kit|RC glider/);
      assert.match(q, /-fuel/);
      assert.match(q, /-nitro/);
      assert.doesNotMatch(url, /q=%20(?:&|$)/);
    }
    assert.ok(Array.isArray(products));
    assert.ok(products.length >= 1);
  });

  it('no usable query: no Browse call and empty products (not q=%20)', async () => {
    const urls = [];
    const products = await searchEbay(
      {
        searchId: 'srch_empty',
        env: 'live',
        queries: [],
        exclude: [{ match: 'fuel' }],
      },
      {
        env: credEnv,
        accessToken: 'FAKE_access_token',
        httpRequest: async (req) => {
          urls.push(req.url);
          return {};
        },
      },
    );
    assert.deepEqual(urls, []);
    assert.deepEqual(products, []);
  });

  it('legacy q still drives Browse', async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const urls = [];
    await searchEbay(
      { q: 'headphones', userId: 'U-EBAY', env: 'sandbox' },
      {
        env: Object.assign({}, credEnv, { EBAY_ENV: 'sandbox', A_SEARCH_ENV: 'sandbox' }),
        accessToken: 'FAKE_access_token',
        httpRequest: async (req) => {
          urls.push(req.url);
          return fixture;
        },
      },
    );
    assert.equal(urls.length, 1);
    assert.match(decodeURIComponent(urls[0]), /q=headphones/);
    assert.equal(keywordsFromMsg({ q: 'headphones' }), 'headphones');
  });
});
