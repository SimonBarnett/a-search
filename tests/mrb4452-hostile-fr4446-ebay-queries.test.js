'use strict';

/**
 * MRB #4452 hostile pins for FR #4446 (eBay agent queries / exclude).
 * Additive: multi-query Browse fan-out, cap, short exclude skip, phrasal -"term".
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  searchEbay,
  queryTextsFromMsg,
  excludeMatchTerms,
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

describe('MRB #4452 hostile FR #4446 eBay queries', () => {
  it('whitespace-only queries[] yield no Browse and no q=%20', async () => {
    const urls = [];
    const products = await searchEbay(
      { env: 'live', queries: ['  ', { q: '\t' }, { q: '' }] },
      {
        env: credEnv,
        accessToken: 'FAKE_access_token',
        httpRequest: async (req) => {
          urls.push(req.url);
          return {};
        },
      },
    );
    assert.deepEqual(queryTextsFromMsg({ queries: ['  ', { q: '\t' }] }), []);
    assert.deepEqual(urls, []);
    assert.deepEqual(products, []);
  });

  it('one Browse call per query text; exclusions on each; no maxResults cap', async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const urls = [];
    // Give each call a unique item id so merge does not collapse to 1.
    let n = 0;
    const products = await searchEbay(
      {
        env: 'live',
        userId: 'U1',
        queries: [{ q: 'RC glider' }, { q: 'glow engine' }, { q: 'servo arm' }],
        exclude: [{ match: 'fuel' }],
      },
      {
        env: credEnv,
        accessToken: 'FAKE_access_token',
        httpRequest: async (req) => {
          urls.push(req.url);
          n += 1;
          const clone = JSON.parse(JSON.stringify(fixture));
          if (Array.isArray(clone.itemSummaries) && clone.itemSummaries[0]) {
            clone.itemSummaries[0].itemId = `v1|${1000 + n}|0`;
          }
          return clone;
        },
      },
    );
    assert.equal(urls.length, 3);
    const qs = urls.map((u) => new URL(u).searchParams.get('q'));
    assert.ok(qs.some((q) => /RC glider/.test(q)));
    assert.ok(qs.some((q) => /glow engine/.test(q)));
    assert.ok(qs.some((q) => /servo arm/.test(q)));
    for (const q of qs) {
      assert.match(q, /-fuel/);
      assert.notEqual(q.trim(), '');
      assert.notEqual(q, ' ');
    }
    assert.ok(products.length >= 1);
    assert.match(urls[0], /limit=200/);
  });

  it('excludeMatchTerms skips tokens shorter than 3 chars; phrasal gets quotes', () => {
    assert.deepEqual(
      excludeMatchTerms({
        exclude: [{ match: 'IC' }, { match: 'fuel' }, 'ab', 'nitro'],
      }),
      ['fuel', 'nitro'],
    );
    assert.equal(
      buildEbayBrowseQ('kit', ['fuel pump']),
      'kit -"fuel pump"',
    );
  });

  it('search.js never falls back to space q for Browse', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'providers', 'live', 'ebay', 'src', 'search.js'),
      'utf8',
    );
    assert.match(src, /queryTextsFromMsg/);
    assert.match(src, /buildEbayBrowseQ/);
    assert.match(src, /never Browse with a blank q/i);
    assert.doesNotMatch(src, /keywordsFromMsg\(msg\)\s*\|\|\s*['"] ['"]/);
    assert.doesNotMatch(src, /q\s*=\s*keywordsFromMsg\(msg\)\s*\|\|\s*['"] ['"]/);
  });
});
