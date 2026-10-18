'use strict';

/**
 * FR-183 / #1030: amazon worker chooses Creators when flag set; else PA-API.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const creatorsFixture = path.join(
  root,
  'providers',
  'live',
  'amazon',
  'fixtures',
  'creators-search-ok.json',
);
const paapiFixture = path.join(
  root,
  'providers',
  'live',
  'amazon',
  'fixtures',
  'search-items-ok.json',
);

const {
  run,
  AmazonCredsError,
  AmazonCreatorsCredsError,
} = require('../providers/live/amazon/src/worker');

const baseMsg = {
  searchId: 'srch_183',
  userId: 'U-183',
  env: 'sandbox',
  source: 'amazon',
  q: 'headphones',
  catalogId: 9,
};

const paapiEnv = {
  A_SEARCH_ENV: 'sandbox',
  AMAZON_ACCESS_KEY: 'AKIATEST',
  AMAZON_SECRET_KEY: 'secret-test',
  AMAZON_PARTNER_TAG: 'tag-20',
  AMAZON_HOST: 'webservices.amazon.co.uk',
  AMAZON_REGION: 'eu-west-1',
  S3_RESULTS_BUCKET: 'test-results',
  AMAZON_SEARCH_API: 'paapi',
};

const creatorsEnv = {
  A_SEARCH_ENV: 'sandbox',
  AMAZON_CREATORS_CREDENTIAL: 'FAKE_CREATORS_CREDENTIAL',
  AMAZON_PARTNER_TAG: 'tag-20',
  AMAZON_CREATORS_ENDPOINT: 'https://example.test/creators/v1/search',
  AMAZON_SEARCH_API: 'creators',
  S3_RESULTS_BUCKET: 'test-results',
};

function utf8NoBom(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.notEqual(buf[0], 0xef, `${rel} must be UTF-8 without BOM`);
  const text = buf.toString('utf8');
  for (let i = 0; i < text.length; i += 1) {
    assert.ok(
      text.charCodeAt(i) < 128,
      `${rel} non-ASCII at ${i}: U+${text.charCodeAt(i).toString(16)}`,
    );
  }
  return text;
}

describe('FR-183 amazon worker Creators flag', () => {
  it('default / paapi path uses PA-API searchitems URL', async () => {
    const fixture = JSON.parse(fs.readFileSync(paapiFixture, 'utf8'));
    const httpCalls = [];
    const out = await run(baseMsg, {
      env: paapiEnv,
      httpRequest: async (signed) => {
        httpCalls.push(signed);
        assert.match(signed.url, /\/paapi5\/searchitems/i);
        return fixture;
      },
      putObject: async () => ({ ETag: '"x"' }),
    });
    assert.equal(out.ok, true);
    assert.equal(out.searchApi, 'paapi');
    assert.equal(out.products.length, 2);
    assert.equal(httpCalls.length, 1);
  });

  it('creators flag uses Creators endpoint and products', async () => {
    const fixture = JSON.parse(fs.readFileSync(creatorsFixture, 'utf8'));
    const httpCalls = [];
    const out = await run(baseMsg, {
      env: creatorsEnv,
      httpRequest: async (req) => {
        httpCalls.push(req);
        assert.match(String(req.url), /creators\/v1\/search/);
        assert.match(String(req.headers.authorization), /^Bearer FAKE_/);
        return fixture;
      },
      putObject: async () => ({ ETag: '"x"' }),
    });
    assert.equal(out.ok, true);
    assert.equal(out.searchApi, 'creators');
    assert.equal(out.products[0].id, 'B0CREATOR1');
    assert.equal(httpCalls.length, 1);
  });

  it('creators flag fail-closed when Creators creds missing', async () => {
    await assert.rejects(
      () =>
        run(baseMsg, {
          env: {
            A_SEARCH_ENV: 'sandbox',
            AMAZON_SEARCH_API: 'creators',
            AMAZON_PARTNER_TAG: 'tag-20',
            S3_RESULTS_BUCKET: 'test-results',
          },
          putObject: async () => ({ ETag: '"x"' }),
        }),
      (err) => err instanceof AmazonCreatorsCredsError,
    );
  });

  it('paapi path still fail-closed when PA-API creds missing', async () => {
    await assert.rejects(
      () =>
        run(baseMsg, {
          env: {
            A_SEARCH_ENV: 'sandbox',
            AMAZON_SEARCH_API: 'paapi',
            S3_RESULTS_BUCKET: 'test-results',
          },
          putObject: async () => ({ ETag: '"x"' }),
        }),
      (err) => err instanceof AmazonCredsError,
    );
  });

  it('FR-183 Decision LOCKED documents worker branch', () => {
    const fr = utf8NoBom('docs/fr/FR-183.md');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /Creators|AMAZON_SEARCH_API/i);
    assert.match(fr, /fail-closed|assertCreatorsCreds/i);
    assert.match(fr, /PA-API/);
  });
});
