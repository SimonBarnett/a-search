'use strict';

/** FR-040: Rakuten Product Search client + fixtures */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fixturePath = path.join(
  __dirname,
  '..',
  'providers',
  'live',
  'rakuten',
  'fixtures',
  'product-search-ok.xml',
);
const { run, RakutenCredsError } = require('../providers/live/rakuten/src/worker');
const { resultsKey } = require('../shared/resultsPath');

const baseMsg = {
  searchId: 'srch_rak_40',
  userId: 'U-RAK',
  env: 'sandbox',
  source: 'rakuten',
  q: 'shoes',
  catalogId: 42,
  category: 'Fashion',
  subcategory: 'Shoes',
};

const credEnv = {
  A_SEARCH_ENV: 'sandbox',
  RAKUTEN_CLIENT_ID: 'FAKE_rakuten_id',
  RAKUTEN_CLIENT_SECRET: 'FAKE_rakuten_secret',
  RAKUTEN_SID: 'FAKE_sid',
  RAKUTEN_SITE_ID: 'site-test',
  RAKUTEN_ENDPOINT: 'https://api.linksynergy.com/productsearch/1.0',
  S3_RESULTS_BUCKET: 'test-results',
};

describe('FR-040 rakuten Product Search client', () => {
  it('fixture XML HTTP â†’ normalize products â†’ S3 put called', async () => {
    const fixture = fs.readFileSync(fixturePath, 'utf8');
    const puts = [];
    const httpCalls = [];

    const out = await run(baseMsg, {
      env: credEnv,
      httpRequest: async (req) => {
        httpCalls.push(req);
        if (req.method === 'POST') {
          assert.match(req.url, /api\.linksynergy\.com\/token/);
          assert.match(req.headers.Authorization, /^Bearer /);
          assert.doesNotMatch(req.url, /FAKE_rakuten/);
          return {
            statusCode: 200,
            headers: {},
            body: JSON.stringify({
              access_token: 'FAKE_rakuten_access',
              refresh_token: 'FAKE_rakuten_refresh',
              expires_in: 3600,
            }),
          };
        }
        const u = new URL(req.url);
        assert.equal(u.hostname, 'api.linksynergy.com');
        assert.equal(u.pathname, '/productsearch/1.0');
        assert.equal(u.searchParams.get('keyword'), 'shoes');
        assert.equal(req.headers.Authorization, 'Bearer FAKE_rakuten_access');
        assert.doesNotMatch(req.url, /FAKE_rakuten/);
        assert.equal(req.method, 'GET');
        return { statusCode: 200, headers: {}, body: fixture };
      },
      putObject: async (args) => {
        puts.push(args);
        return { ETag: '"x"' };
      },
    });

    assert.equal(out.ok, true);
    assert.equal(out.source, 'rakuten');
    assert.equal(out.products.length, 2);
    assert.equal(out.products[0].id, 'RK-FIX-001');
    assert.equal(out.products[0].title, 'Fixture Running Shoes');
    assert.equal(out.products[0].price, 59.99);
    assert.equal(out.products[0].currency, 'GBP');
    assert.equal(out.products[0].source, 'rakuten');
    assert.doesNotMatch(JSON.stringify(out), /not wired yet/i);
    assert.equal(httpCalls.length, 2);
    assert.equal(puts.length, 1);
    assert.equal(
      puts[0].Key,
      resultsKey({
        env: 'sandbox',
        source: 'rakuten',
        userId: 'U-RAK',
        catalogId: 42,
        searchId: 'srch_rak_40',
      }),
    );
  });

  it('missing Rakuten creds â†’ clear rakuten_missing_credentials error', async () => {
    await assert.rejects(
      () =>
        run(baseMsg, {
          env: { A_SEARCH_ENV: 'sandbox', S3_RESULTS_BUCKET: 'b' },
          httpRequest: async () => {
            throw new Error('should not call HTTP');
          },
          putObject: async () => {
            throw new Error('should not put');
          },
        }),
      (err) => {
        assert.ok(
          err instanceof RakutenCredsError ||
            err.code === 'rakuten_missing_credentials',
        );
        assert.match(
          String(err.message),
          /RAKUTEN_CLIENT_ID|credentials missing/i,
        );
        return true;
      },
    );
  });

  it('fail-when: stub-only message is gone', () => {
    const workerSrc = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'providers',
        'live',
        'rakuten',
        'src',
        'worker.js',
      ),
      'utf8',
    );
    assert.match(workerSrc, /searchRakuten|writeResults/);
    assert.doesNotMatch(workerSrc, /Product Search XML client not wired yet/);
    assert.ok(
      fs.existsSync(
        path.join(
          __dirname,
          '..',
          'providers',
          'live',
          'rakuten',
          'src',
          'search.js',
        ),
      ),
    );
  });
});
