'use strict';

/** FR-039: eBay Browse API search client + fixtures */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fixturePath = path.join(
  __dirname,
  '..',
  'providers',
  'live',
  'ebay',
  'fixtures',
  'item-summary-ok.json',
);
const { run, EbayCredsError } = require('../providers/live/ebay/src/worker');
const { resultsKey } = require('../worker/lib/resultsPath');

const baseMsg = {
  searchId: 'srch_ebay_39',
  userId: 'U-EBAY',
  env: 'sandbox',
  source: 'ebay',
  q: 'headphones',
  catalogId: 42,
  category: 'Electronics',
  subcategory: 'Headphones',
};

const credEnv = {
  A_SEARCH_ENV: 'sandbox',
  EBAY_CLIENT_ID: 'client-test',
  EBAY_CLIENT_SECRET: 'secret-test',
  EBAY_REFRESH_TOKEN: '',
  EBAY_MARKETPLACE_ID: 'EBAY_GB',
  EBAY_ENV: 'sandbox',
  S3_RESULTS_BUCKET: 'test-results',
};

describe('FR-039 ebay Browse API search client', () => {
  it('fixture HTTP → normalize products → S3 put called', async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const puts = [];
    const httpCalls = [];

    const out = await run(baseMsg, {
      env: credEnv,
      accessToken: 'test-token',
      httpRequest: async (req) => {
        httpCalls.push(req);
        assert.match(req.url, /\/buy\/browse\/v1\/item_summary\/search/);
        assert.equal(req.method, 'GET');
        assert.match(req.headers.Authorization, /^Bearer /);
        assert.equal(req.headers['X-EBAY-C-MARKETPLACE-ID'], 'EBAY_GB');
        return fixture;
      },
      putObject: async (args) => {
        puts.push(args);
        return { ETag: '"x"' };
      },
    });

    assert.equal(out.ok, true);
    assert.equal(out.source, 'ebay');
    assert.ok(Array.isArray(out.products));
    assert.equal(out.products.length, 2);
    assert.equal(out.products[0].id, 'v1|110000000001|0');
    assert.equal(out.products[0].title, 'Fixture Wireless Headphones');
    assert.equal(out.products[0].price, 29.99);
    assert.equal(out.products[0].currency, 'GBP');
    assert.equal(out.products[0].source, 'ebay');
    assert.doesNotMatch(JSON.stringify(out), /Browse API client not wired/i);
    assert.equal(httpCalls.length, 1);
    assert.equal(puts.length, 1);
    assert.equal(puts[0].Bucket, 'test-results');
    assert.equal(
      puts[0].Key,
      resultsKey({
        env: 'sandbox',
        source: 'ebay',
        userId: 'U-EBAY',
        catalogId: 42,
        searchId: 'srch_ebay_39',
      }),
    );
  });

  it('missing eBay creds → clear ebay_missing_credentials error', async () => {
    await assert.rejects(
      () =>
        run(baseMsg, {
          env: {
            A_SEARCH_ENV: 'sandbox',
            S3_RESULTS_BUCKET: 'b',
          },
          httpRequest: async () => {
            throw new Error('should not call HTTP');
          },
          putObject: async () => {
            throw new Error('should not put');
          },
        }),
      (err) => {
        assert.ok(
          err instanceof EbayCredsError || err.code === 'ebay_missing_credentials',
        );
        assert.match(String(err.message), /EBAY_CLIENT_ID|credentials missing/i);
        return true;
      },
    );
  });

  it('fail-when: run is not scaffold-only (has HTTP path)', async () => {
    const workerSrc = fs.readFileSync(
      path.join(__dirname, '..', 'providers', 'live', 'ebay', 'src', 'worker.js'),
      'utf8',
    );
    assert.match(workerSrc, /searchEbay|writeResults/);
    assert.doesNotMatch(
      workerSrc,
      /Browse API client not wired yet; no remote call/,
    );
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'providers', 'live', 'ebay', 'src', 'search.js')));
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'providers', 'live', 'ebay', 'src', 'normalize.js')));
  });
});
