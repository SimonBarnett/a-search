'use strict';

/**
 * FR-075: etsy search.js client + recorded fixtures (stay-dark).
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
  'etsy',
  'fixtures',
  'listings-ok.json',
);
const searchPath = path.join(
  root,
  'providers',
  'live',
  'etsy',
  'src',
  'search.js',
);
const envExample = path.join(root, 'providers', 'live', 'etsy', '.env.example');

describe('FR-075 etsy search client', () => {
  it('search.js and fixture exist', () => {
    assert.ok(fs.existsSync(searchPath), 'missing providers/live/etsy/src/search.js');
    assert.ok(fs.existsSync(fixturePath), 'missing fixtures/listings-ok.json');
    assert.ok(fs.existsSync(envExample), 'missing .env.example');
    const envText = fs.readFileSync(envExample, 'utf8');
    assert.match(envText, /ETSY_API_KEY/);
  });

  it('injected fetch loads fixture and returns parsed payload', async () => {
    const {
      searchEtsy,
      DEFAULT_API_BASE,
    } = require('../providers/live/etsy/src/search');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const httpCalls = [];

    const out = await searchEtsy(
      { q: 'mug', userId: 'U1', env: 'sandbox', searchId: 'srch_et_75' },
      {
        env: {
          A_SEARCH_ENV: 'sandbox',
          ETSY_API_KEY: 'fixture-key',
        },
        httpRequest: async (req) => {
          httpCalls.push(req);
          assert.equal(req.method, 'GET');
          assert.match(req.url, /etsy|listings\/active/i);
          assert.match(req.url, /keywords=mug/i);
          assert.equal(req.headers['x-api-key'], 'fixture-key');
          return fixture;
        },
      },
    );

    assert.equal(httpCalls.length, 1);
    assert.ok(out && typeof out === 'object');
    assert.ok(out.etsyProductAPI);
    assert.ok(Array.isArray(out.etsyProductAPI.results));
    assert.equal(out.etsyProductAPI.results.length, 2);
    assert.equal(out.etsyProductAPI.results[0].listing_id, 10001);
    assert.equal(
      out.etsyProductAPI.results[0].title,
      'Fixture Handmade Ceramic Mug',
    );
    assert.equal(typeof DEFAULT_API_BASE, 'string');
    assert.match(DEFAULT_API_BASE, /etsy/i);
  });

  it('missing ETSY_API_KEY throws etsy_missing_credentials', async () => {
    const {
      searchEtsy,
      EtsyCredsError,
    } = require('../providers/live/etsy/src/search');

    await assert.rejects(
      () =>
        searchEtsy(
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
          err instanceof EtsyCredsError || err.code === 'etsy_missing_credentials',
        );
        assert.match(String(err.message), /ETSY_API_KEY|credentials missing/i);
        return true;
      },
    );
  });

  it('registry keeps etsy enabled.live and enabled.sandbox false', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const et = registry.sources.find((s) => s.id === 'etsy');
    assert.ok(et, 'registry missing etsy');
    assert.equal(et.enabled.live, false);
    assert.equal(et.enabled.sandbox, false);
  });
});
