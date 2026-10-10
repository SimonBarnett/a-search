'use strict';

/**
 * FR-079: bol search.js client + recorded fixtures (enabled FR-171).
 * No live network; registry enabled true (FR-171).
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
  'bol',
  'fixtures',
  'products-ok.json',
);
const searchPath = path.join(
  root,
  'providers',
  'live',
  'bol',
  'src',
  'search.js',
);
const envExample = path.join(root, 'providers', 'live', 'bol', '.env.example');

describe('FR-079 bol search client', () => {
  it('search.js and fixture exist', () => {
    assert.ok(fs.existsSync(searchPath), 'missing providers/live/bol/src/search.js');
    assert.ok(fs.existsSync(fixturePath), 'missing fixtures/products-ok.json');
    assert.ok(fs.existsSync(envExample), 'missing .env.example');
    const envText = fs.readFileSync(envExample, 'utf8');
    assert.match(envText, /BOL_API_KEY/);
  });

  it('injected fetch loads fixture and returns parsed payload', async () => {
    const {
      searchBol,
      DEFAULT_API_BASE,
    } = require('../providers/live/bol/src/search');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const httpCalls = [];

    const out = await searchBol(
      { q: 'earbuds', userId: 'U1', env: 'sandbox', searchId: 'srch_bol_79' },
      {
        env: {
          A_SEARCH_ENV: 'sandbox',
          BOL_API_KEY: 'fixture-key',
        },
        httpRequest: async (req) => {
          httpCalls.push(req);
          assert.equal(req.method, 'GET');
          assert.match(req.url, /bol|catalog\/v4\/search/i);
          assert.match(req.url, /q=earbuds/i);
          assert.equal(req.headers['X-API-KEY'], 'fixture-key');
          return fixture;
        },
      },
    );

    assert.equal(httpCalls.length, 1);
    assert.ok(out && typeof out === 'object');
    assert.ok(out.bolProductAPI);
    assert.ok(Array.isArray(out.bolProductAPI.products));
    assert.equal(out.bolProductAPI.products.length, 2);
    assert.equal(out.bolProductAPI.products[0].id, 'bol-fix-001');
    assert.equal(
      out.bolProductAPI.products[0].title,
      'Fixture Wireless Earbuds NL',
    );
    assert.equal(typeof DEFAULT_API_BASE, 'string');
    assert.match(DEFAULT_API_BASE, /bol/i);
  });

  it('missing BOL_API_KEY throws bol_missing_credentials', async () => {
    const {
      searchBol,
      BolCredsError,
    } = require('../providers/live/bol/src/search');

    await assert.rejects(
      () =>
        searchBol(
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
          err instanceof BolCredsError || err.code === 'bol_missing_credentials',
        );
        assert.match(String(err.message), /BOL_API_KEY|credentials missing/i);
        return true;
      },
    );
  });

  it('registry keeps bol enabled.live and enabled.sandbox true (FR-171)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const bol = registry.sources.find((s) => s.id === 'bol');
    assert.ok(bol, 'registry missing bol');
    assert.equal(bol.enabled.live, true);
    assert.equal(bol.enabled.sandbox, true);
  });
});
