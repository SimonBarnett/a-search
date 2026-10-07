'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fixturePath = path.join(
  __dirname,
  '..',
  'providers',
  'live',
  'amazon',
  'fixtures',
  'search-items-ok.json',
);
const { run, AmazonCredsError } = require('../providers/live/amazon/src/worker');
const { resultsKey } = require('../worker/lib/resultsPath');

const baseMsg = {
  searchId: 'srch_amz_30',
  userId: 'U-AMZ',
  env: 'sandbox',
  source: 'amazon',
  q: 'headphones',
  catalogId: 42,
  category: 'Electronics',
  subcategory: 'Headphones',
};

const credEnv = {
  A_SEARCH_ENV: 'sandbox',
  AMAZON_ACCESS_KEY: 'AKIATEST',
  AMAZON_SECRET_KEY: 'secret-test',
  AMAZON_PARTNER_TAG: 'tag-20',
  AMAZON_HOST: 'webservices.amazon.co.uk',
  AMAZON_REGION: 'eu-west-1',
  S3_RESULTS_BUCKET: 'test-results',
};

describe('FR-030 amazon live search client', () => {
  it('fixture HTTP → normalize products → S3 put called', async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const puts = [];
    const httpCalls = [];

    const out = await run(baseMsg, {
      env: credEnv,
      httpRequest: async (signed) => {
        httpCalls.push(signed);
        assert.match(signed.url, /\/paapi5\/searchitems/);
        assert.equal(signed.method, 'POST');
        assert.ok(signed.headers.authorization);
        return fixture;
      },
      putObject: async (args) => {
        puts.push(args);
        return { ETag: '"x"' };
      },
    });

    assert.equal(out.ok, true);
    assert.equal(out.source, 'amazon');
    assert.equal(out.products.length, 2);
    assert.equal(out.products[0].id, 'B0TESTASIN1');
    assert.equal(out.products[0].title, 'Fixture Wireless Headphones');
    assert.equal(out.products[0].price, 29.99);
    assert.equal(out.products[0].currency, 'GBP');
    assert.equal(httpCalls.length, 1);
    assert.equal(puts.length, 1);
    assert.equal(puts[0].Bucket, 'test-results');
    assert.equal(
      puts[0].Key,
      resultsKey({
        env: 'sandbox',
        source: 'amazon',
        userId: 'U-AMZ',
        catalogId: 42,
        searchId: 'srch_amz_30',
      }),
    );
    const body = JSON.parse(puts[0].Body);
    assert.equal(body.products.length, 2);
  });

  it('missing Amazon creds → clear amazon_missing_credentials error', async () => {
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
        assert.ok(err instanceof AmazonCredsError || err.code === 'amazon_missing_credentials');
        assert.match(String(err.message), /AMAZON_ACCESS_KEY|credentials missing/i);
        return true;
      },
    );
  });
});
