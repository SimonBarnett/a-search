'use strict';

/**
 * FR-067 / FR-168: skimlinks search.js client + recorded fixtures (enabled).
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
  'skimlinks',
  'fixtures',
  'products-ok.json',
);
const searchPath = path.join(
  root,
  'providers',
  'live',
  'skimlinks',
  'src',
  'search.js',
);
const envExample = path.join(
  root,
  'providers',
  'live',
  'skimlinks',
  '.env.example',
);

describe('FR-067 skimlinks search client', () => {
  it('search.js and fixture exist', () => {
    assert.ok(fs.existsSync(searchPath), 'missing providers/live/skimlinks/src/search.js');
    assert.ok(fs.existsSync(fixturePath), 'missing fixtures/products-ok.json');
    assert.ok(fs.existsSync(envExample), 'missing .env.example');
    const envText = fs.readFileSync(envExample, 'utf8');
    assert.match(envText, /SKIMLINKS_API_KEY/);
  });

  it('injected fetch loads fixture and returns parsed payload', async () => {
    const {
      searchSkimlinks,
      DEFAULT_PRODUCT_BASE,
    } = require('../providers/live/skimlinks/src/search');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const httpCalls = [];

    const out = await searchSkimlinks(
      { q: 'laptop', userId: 'U1', env: 'sandbox', searchId: 'srch_sk_67' },
      {
        env: {
          A_SEARCH_ENV: 'sandbox',
          SKIMLINKS_API_KEY: 'fixture-key',
          SKIMLINKS_COUNTRY: 'uk',
        },
        httpRequest: async (req) => {
          httpCalls.push(req);
          assert.equal(req.method, 'GET');
          assert.match(req.url, /skimlinks|product\/query/i);
          assert.match(req.url, /q=laptop|query=laptop/i);
          assert.match(req.url, /key=fixture-key|apikey=fixture-key/i);
          return fixture;
        },
      },
    );

    assert.equal(httpCalls.length, 1);
    assert.ok(out && typeof out === 'object');
    assert.ok(out.skimlinksProductAPI);
    assert.ok(Array.isArray(out.skimlinksProductAPI.products));
    assert.equal(out.skimlinksProductAPI.products.length, 2);
    assert.equal(out.skimlinksProductAPI.products[0].id, 'sk-fix-001');
    assert.equal(
      out.skimlinksProductAPI.products[0].title,
      'Fixture Ultrabook Laptop',
    );
    assert.equal(typeof DEFAULT_PRODUCT_BASE, 'string');
    assert.match(DEFAULT_PRODUCT_BASE, /skimlinks/i);
  });

  it('missing SKIMLINKS_API_KEY throws skimlinks_missing_credentials', async () => {
    const {
      searchSkimlinks,
      SkimlinksCredsError,
    } = require('../providers/live/skimlinks/src/search');

    await assert.rejects(
      () =>
        searchSkimlinks(
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
          err instanceof SkimlinksCredsError ||
            err.code === 'skimlinks_missing_credentials',
        );
        assert.match(
          String(err.message),
          /SKIMLINKS_API_KEY|credentials missing/i,
        );
        return true;
      },
    );
  });

  it('registry enables skimlinks (FR-168)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const sk = registry.sources.find((s) => s.id === 'skimlinks');
    assert.ok(sk, 'registry missing skimlinks');
    assert.equal(sk.enabled.live, true);
    assert.equal(sk.enabled.sandbox, true);
  });
});
