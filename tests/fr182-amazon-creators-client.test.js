'use strict';

/**
 * FR-182 / #1029: Amazon Creators client + fixtures (flagged off by default).
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
  'amazon',
  'fixtures',
  'creators-search-ok.json',
);

const {
  searchAmazonCreators,
  isCreatorsSearchEnabled,
  assertCreatorsCreds,
  AmazonCreatorsCredsError,
  buildCreatorsSearchRequest,
} = require('../providers/live/amazon/src/creatorsSearch');
const { searchAmazon } = require('../providers/live/amazon/src/search');

const baseMsg = {
  searchId: 'srch_creators_182',
  userId: 'U-CR',
  env: 'sandbox',
  source: 'amazon',
  q: 'headphones',
  catalogId: 7,
};

const creatorsEnv = {
  A_SEARCH_ENV: 'sandbox',
  AMAZON_CREATORS_CREDENTIAL: 'FAKE_CREATORS_CREDENTIAL',
  AMAZON_PARTNER_TAG: 'tag-20',
  AMAZON_CREATORS_ENDPOINT: 'https://example.test/creators/v1/search',
  AMAZON_SEARCH_API: 'creators',
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

describe('FR-182 Amazon Creators client (flagged off)', () => {
  it('feature flag defaults off; creators|true enables', () => {
    assert.equal(isCreatorsSearchEnabled({}), false);
    assert.equal(isCreatorsSearchEnabled({ AMAZON_SEARCH_API: 'paapi' }), false);
    assert.equal(isCreatorsSearchEnabled({ AMAZON_SEARCH_API: 'creators' }), true);
    assert.equal(isCreatorsSearchEnabled({ AMAZON_CREATORS_ENABLED: 'true' }), true);
    assert.equal(isCreatorsSearchEnabled({ AMAZON_CREATORS_ENABLED: '0' }), false);
  });

  it('assertCreatorsCreds requires credential + partner tag', () => {
    assert.throws(
      () => assertCreatorsCreds({ AMAZON_PARTNER_TAG: 'tag-20' }),
      (err) => err instanceof AmazonCreatorsCredsError,
    );
    assert.doesNotThrow(() =>
      assertCreatorsCreds({
        AMAZON_CREATORS_CREDENTIAL: 'FAKE_CREATORS_CREDENTIAL',
        AMAZON_PARTNER_TAG: 'tag-20',
      }),
    );
  });

  it('fixture HTTP -> normalize products (no live network)', async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const httpCalls = [];
    const products = await searchAmazonCreators(baseMsg, {
      env: creatorsEnv,
      httpRequest: async (req) => {
        httpCalls.push(req);
        assert.equal(req.method, 'POST');
        assert.match(req.url, /creators\/v1\/search/);
        assert.match(String(req.headers.authorization), /^Bearer FAKE_/);
        const body = JSON.parse(req.body);
        assert.equal(body.keywords, 'headphones');
        assert.equal(body.partnerTag, 'tag-20');
        return fixture;
      },
    });
    assert.equal(httpCalls.length, 1);
    assert.equal(products.length, 2);
    assert.equal(products[0].id, 'B0CREATOR1');
    assert.equal(products[0].title, 'Creators Fixture Wireless Headphones');
    assert.equal(products[0].price, 31.5);
    assert.equal(products[0].currency, 'GBP');
    assert.equal(products[0].source, 'amazon');
    assert.match(String(products[0].url), /B0CREATOR1/);
  });

  it('buildCreatorsSearchRequest is pure and uses endpoint from env', () => {
    const creds = assertCreatorsCreds(creatorsEnv);
    const req = buildCreatorsSearchRequest(baseMsg, creds);
    assert.equal(req.url, creatorsEnv.AMAZON_CREATORS_ENDPOINT);
    assert.equal(req.method, 'POST');
  });

  it('PA-API searchAmazon export still present (default path unchanged)', () => {
    assert.equal(typeof searchAmazon, 'function');
  });

  it('FR-182 Decision LOCKED + .env.example Creators placeholders', () => {
    const fr = utf8NoBom('docs/fr/FR-182.md');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /flagged off|feature flag|AMAZON_SEARCH_API/i);
    assert.match(fr, /PA-API/);
    assert.match(fr, /creatorsSearch/);
    const envEx = utf8NoBom('providers/live/amazon/.env.example');
    assert.match(envEx, /AMAZON_SEARCH_API/);
    assert.match(envEx, /AMAZON_CREATORS_CREDENTIAL/);
    assert.match(envEx, /AMAZON_CREATORS_ENDPOINT/);
  });
});
