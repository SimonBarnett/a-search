'use strict';

/**
 * FR #4450: remaining live providers honour agent /search queries/exclude
 * (same class as ebay #4446). HTTP stubbed; legacy q still works; blank never sent.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const agentMsg = {
  searchId: 'srch_4450',
  searchid: 'srch_4450',
  userId: 'U-4450',
  env: 'sandbox',
  hostkey: 'club.example',
  guid: 'guid-4450',
  queries: [{ q: 'model aircraft' }, 'servo'],
  exclude: [{ match: 'title:calendar' }],
};

const providers = [
  'amazon',
  'rakuten',
  'kelkoo',
  'etsy',
  'cj',
  'bol',
  'aliexpress',
  'ebay',
];

describe('FR #4450 live providers agent queries', () => {
  for (const id of providers) {
    it(`${id} keywordsFromMsg reads queries/exclude`, () => {
      const mod = require(`../providers/live/${id}/src/search`);
      assert.equal(typeof mod.keywordsFromMsg, 'function');
      const kw = mod.keywordsFromMsg(agentMsg);
      assert.match(kw, /model aircraft/);
      assert.match(kw, /servo/);
      assert.match(kw, /-calendar/);
      assert.equal(mod.keywordsFromMsg({ q: 'legacy-q' }), 'legacy-q');
      assert.equal(mod.keywordsFromMsg({ queries: [] }), '');
    });
  }

  it('ebay searchEbay never sends blank q for agent msg; empty queries skip HTTP', async () => {
    const { searchEbay } = require('../providers/live/ebay/src/search');
    const calls = [];
    const env = {
      EBAY_CLIENT_ID: 'id',
      EBAY_CLIENT_SECRET: 'sec',
      EBAY_ENV: 'sandbox',
    };
    const empty = await searchEbay(
      { ...agentMsg, queries: [], exclude: [] },
      {
        env,
        httpRequest: async (req) => {
          calls.push(req);
          return { itemSummaries: [] };
        },
      },
    );
    assert.deepEqual(empty, []);
    assert.equal(calls.length, 0);

    await searchEbay(agentMsg, {
      env,
      accessToken: 'tok',
      httpRequest: async (req) => {
        calls.push(req);
        const q = new URL(req.url).searchParams.get('q') || '';
        assert.ok(q.trim() && q !== ' ');
        assert.doesNotMatch(String(req.url), /q=%20(?:&|$)/);
        // FR #4446/#4452: one Browse call per query text (shared helper joins; ebay fans out).
        assert.match(q, /model aircraft|servo/i);
        return { itemSummaries: [] };
      },
    });
    assert.ok(calls.length >= 1);
    assert.ok(calls.length <= 2);
  });

  it('amazon searchAmazon puts Keywords from queries (not space)', async () => {
    const { searchAmazon } = require('../providers/live/amazon/src/search');
    const calls = [];
    const env = {
      AMAZON_ACCESS_KEY: 'AKIATEST',
      AMAZON_SECRET_KEY: 'secret-test',
      AMAZON_PARTNER_TAG: 'tag-20',
      AMAZON_HOST: 'webservices.amazon.co.uk',
      AMAZON_REGION: 'eu-west-1',
    };
    const empty = await searchAmazon(
      { queries: [] },
      {
        env,
        httpRequest: async (req) => {
          calls.push(req);
          return { SearchResult: { Items: [] } };
        },
      },
    );
    assert.deepEqual(empty, []);
    assert.equal(calls.length, 0);

    await searchAmazon(agentMsg, {
      env,
      httpRequest: async (req) => {
        calls.push(req);
        const body =
          typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
        // PA-API signer may put JSON on body or nested — also check stringify
        const blob = JSON.stringify(req);
        assert.match(blob, /model aircraft/);
        assert.match(blob, /servo/);
        assert.doesNotMatch(blob, /"Keywords":" "/);
        return { SearchResult: { Items: [] } };
      },
    });
    assert.equal(calls.length, 1);
  });

  it('rakuten searchRakuten uses agent keywords; skips HTTP when empty', async () => {
    const {
      searchRakuten,
      resetRakutenTokenCache,
    } = require('../providers/live/rakuten/src/search');
    resetRakutenTokenCache();
    const calls = [];
    const env = {
      RAKUTEN_CLIENT_ID: 'FAKE_rakuten_id',
      RAKUTEN_CLIENT_SECRET: 'FAKE_rakuten_secret',
      RAKUTEN_SID: 'FAKE_sid',
    };
    assert.deepEqual(
      await searchRakuten(
        { queries: [] },
        { env, httpRequest: async (r) => (calls.push(r), { statusCode: 200, body: '<root/>' }) },
      ),
      [],
    );
    assert.equal(calls.length, 0);

    // FR #4768: one Product Search call per query (not AND-joined keyword).
    await searchRakuten(agentMsg, {
      env,
      httpRequest: async (req) => {
        calls.push(req);
        if (req.method === 'POST') {
          return {
            statusCode: 200,
            body: JSON.stringify({ access_token: 'FAKE_rakuten_access', expires_in: 3600 }),
          };
        }
        const blob = JSON.stringify(req);
        assert.doesNotMatch(blob, /keyword['\"]?\s*[:=]\s*['\"]\s*['\"]/);
        return { statusCode: 200, body: '<root/>' };
      },
    });
    const productGets = calls.filter(
      (c) => c && c.method === 'GET' && /productsearch/i.test(String(c.url || '')),
    );
    assert.equal(productGets.length, 2);
    const allUrls = productGets.map((c) => String(c.url || '')).join(' ');
    assert.match(allUrls, /model/i);
    assert.match(allUrls, /servo/i);
    assert.equal(calls.length, 3); // token + 2 product searches
  });
});
