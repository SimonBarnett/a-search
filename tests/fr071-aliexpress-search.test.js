'use strict';

/**
 * FR-071: aliexpress search.js client + recorded fixtures (enabled FR-169).
 * No live network; registry enabled stays false.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const fixturePath = path.join(
  root,
  'providers',
  'live',
  'aliexpress',
  'fixtures',
  'products-ok.json',
);
const searchPath = path.join(
  root,
  'providers',
  'live',
  'aliexpress',
  'src',
  'search.js',
);
const envExample = path.join(
  root,
  'providers',
  'live',
  'aliexpress',
  '.env.example',
);

describe('FR-071 aliexpress search client', () => {
  it('search.js and fixture exist', () => {
    assert.ok(
      fs.existsSync(searchPath),
      'missing providers/live/aliexpress/src/search.js',
    );
    assert.ok(fs.existsSync(fixturePath), 'missing fixtures/products-ok.json');
    assert.ok(fs.existsSync(envExample), 'missing .env.example');
    const envText = fs.readFileSync(envExample, 'utf8');
    assert.match(envText, /ALIEXPRESS_API_KEY/);
  });

  it('injected fetch loads fixture and returns parsed payload', async () => {
    const {
      searchAliexpress,
      DEFAULT_API_BASE,
    } = require('../providers/live/aliexpress/src/search');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const httpCalls = [];

    const out = await searchAliexpress(
      { q: 'earbuds', userId: 'U1', env: 'sandbox', searchId: 'srch_ae_71' },
      {
        env: {
          A_SEARCH_ENV: 'sandbox',
          ALIEXPRESS_API_KEY: 'fixture-key',
          ALIEXPRESS_TRACKING_ID: 'a-search-test',
        },
        httpRequest: async (req) => {
          httpCalls.push(req);
          assert.equal(req.method, 'GET');
          assert.match(req.url, /aliexpress|affiliate\.product\.query/i);
          assert.match(req.url, /keywords=earbuds/);
          assert.match(req.url, /app_key=fixture-key/);
          return fixture;
        },
      },
    );

    assert.equal(httpCalls.length, 1);
    assert.ok(out && typeof out === 'object');
    assert.ok(out.aliexpressProductAPI);
    assert.ok(Array.isArray(out.aliexpressProductAPI.products));
    assert.equal(out.aliexpressProductAPI.products.length, 2);
    assert.equal(
      out.aliexpressProductAPI.products[0].product_id,
      'ae-fix-001',
    );
    assert.equal(
      out.aliexpressProductAPI.products[0].product_title,
      'Fixture Wireless Earbuds',
    );
    assert.equal(typeof DEFAULT_API_BASE, 'string');
    assert.match(DEFAULT_API_BASE, /aliexpress/i);
  });

  it('missing ALIEXPRESS_API_KEY throws aliexpress_missing_credentials', async () => {
    const {
      searchAliexpress,
      AliexpressCredsError,
    } = require('../providers/live/aliexpress/src/search');

    await assert.rejects(
      () =>
        searchAliexpress(
          { q: 'x', env: 'sandbox' },
          {
            env: { A_SEARCH_ENV: 'sandbox' },
            httpRequest: async () => {
              throw new Error('should not call HTTP');
            },
          },
        ),
      (err) => {
        assert.ok(
          err instanceof AliexpressCredsError ||
            err.code === 'aliexpress_missing_credentials',
        );
        assert.match(
          String(err.message),
          /ALIEXPRESS_API_KEY|credentials missing/i,
        );
        return true;
      },
    );
  });

  it('registry keeps aliexpress enabled.live and enabled.sandbox true (FR-169)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const ae = registry.sources.find((s) => s.id === 'aliexpress');
    assert.ok(ae, 'registry missing aliexpress');
    assert.equal(ae.enabled.live, true);
    assert.equal(ae.enabled.sandbox, true);
  });
});
