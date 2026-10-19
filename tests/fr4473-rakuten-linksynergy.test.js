'use strict';

/**
 * FR #4473: Rakuten Product Search is api.linksynergy.com/productsearch/1.0
 * with a Bearer token. The token is never on the URL.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  searchRakuten,
  RakutenCredsError,
} = require('../providers/live/rakuten/src/search');

const fixture = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'providers',
    'live',
    'rakuten',
    'fixtures',
    'product-search-ok.xml',
  ),
  'utf8',
);

const env = {
  RAKUTEN_PRODUCT_SEARCH_TOKEN: 'FAKE_rakuten_product_search_token',
  RAKUTEN_SITE_ID: 'FAKE_publisher',
};

describe('FR #4473 Rakuten Linksynergy Product Search', () => {
  it('requests host, path, keyword and Bearer, and parses the XML fixture', async () => {
    const calls = [];
    const products = await searchRakuten(
      {
        userId: 'MMFC0001',
        env: 'live',
        queries: [{ q: 'model aircraft kit' }],
      },
      {
        env,
        httpRequest: async (req) => {
          calls.push(req);
          return { statusCode: 200, body: fixture };
        },
      },
    );

    assert.equal(calls.length, 1);
    const u = new URL(calls[0].url);
    assert.equal(u.hostname, 'api.linksynergy.com');
    assert.equal(u.pathname, '/productsearch/1.0');
    assert.equal(u.searchParams.get('keyword'), 'model aircraft kit');
    assert.equal(
      calls[0].headers.Authorization,
      'Bearer FAKE_rakuten_product_search_token',
    );
    assert.doesNotMatch(calls[0].url, /FAKE_rakuten_product_search_token/);
    assert.equal(products.length, 2);
    assert.equal(products[0].id, 'RK-FIX-001');
    assert.equal(products[0].title, 'Fixture Running Shoes');
    assert.equal(products[0].source, 'rakuten');
    assert.match(products[0].url, /u1=MMFC0001/);
  });

  it('missing token fails closed with rakuten_missing_credentials and does not call HTTP', async () => {
    await assert.rejects(
      () =>
        searchRakuten(
          { q: 'shoes', userId: 'U-RAK' },
          {
            env: {},
            httpRequest: async () => {
              throw new Error('should not call HTTP');
            },
          },
        ),
      (err) => {
        assert.ok(err instanceof RakutenCredsError);
        assert.equal(err.code, 'rakuten_missing_credentials');
        return true;
      },
    );
  });
});
