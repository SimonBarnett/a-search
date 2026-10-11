'use strict';

/**
 * FR-063: kelkoo search.js client + recorded fixtures (stay-dark).
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
  'kelkoo',
  'fixtures',
  'offers-ok.json',
);
const searchPath = path.join(
  root,
  'providers',
  'live',
  'kelkoo',
  'src',
  'search.js',
);
const envExample = path.join(
  root,
  'providers',
  'live',
  'kelkoo',
  '.env.example',
);

describe('FR-063 kelkoo search client', () => {
  it('search.js and fixture exist', () => {
    assert.ok(fs.existsSync(searchPath), 'missing providers/live/kelkoo/src/search.js');
    assert.ok(fs.existsSync(fixturePath), 'missing fixtures/offers-ok.json');
    assert.ok(fs.existsSync(envExample), 'missing .env.example');
    const envText = fs.readFileSync(envExample, 'utf8');
    assert.match(envText, /KELKOO_API_KEY/);
  });

  it('injected fetch loads fixture and returns parsed payload', async () => {
    const {
      searchKelkoo,
      DEFAULT_SHOPPING_BASE,
    } = require('../providers/live/kelkoo/src/search');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const httpCalls = [];

    const out = await searchKelkoo(
      { q: 'laptop', userId: 'U1', env: 'sandbox', searchId: 'srch_kk_63' },
      {
        env: {
          A_SEARCH_ENV: 'sandbox',
          KELKOO_API_KEY: 'fixture-token',
          KELKOO_COUNTRY: 'uk',
        },
        httpRequest: async (req) => {
          httpCalls.push(req);
          assert.equal(req.method, 'GET');
          assert.match(req.url, /kelkoogroup\.net|KELKOO|search\/offers/i);
          assert.match(req.url, /query=laptop|query=laptop/i);
          assert.match(req.url, /country=uk/i);
          assert.match(String(req.headers.Authorization), /^Bearer\s+/);
          return fixture;
        },
      },
    );

    assert.equal(httpCalls.length, 1);
    assert.ok(out && typeof out === 'object');
    assert.ok(Array.isArray(out.offers));
    assert.equal(out.offers.length, 2);
    assert.equal(out.offers[0].offerId, 'kk-fix-001');
    assert.equal(out.offers[0].title, 'Fixture Ultrabook Laptop');
    assert.equal(typeof DEFAULT_SHOPPING_BASE, 'string');
    assert.match(DEFAULT_SHOPPING_BASE, /kelkoogroup\.net/);
  });

  it('missing KELKOO_API_KEY throws kelkoo_missing_credentials', async () => {
    const {
      searchKelkoo,
      KelkooCredsError,
    } = require('../providers/live/kelkoo/src/search');

    await assert.rejects(
      () =>
        searchKelkoo(
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
          err instanceof KelkooCredsError ||
            err.code === 'kelkoo_missing_credentials',
        );
        assert.match(String(err.message), /KELKOO_API_KEY|credentials missing/i);
        return true;
      },
    );
  });

  it('registry keeps kijiji enabled.live and enabled.sandbox true (FR-167)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const kk = registry.sources.find((s) => s.id === 'kelkoo');
    assert.ok(kk, 'registry missing kelkoo');
    assert.equal(kk.enabled.live, true);
    assert.equal(kk.enabled.sandbox, true);
  });
});
