'use strict';

/**
 * FR-185 / #1032: Creators tracked-link parity with PA-API (S17 / FR-057).
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

const { stampAmazonTrackedUrl } = require('../providers/live/amazon/src/stampAmazonTrackedUrl');
const { normalizeCreatorsResponse } = require('../providers/live/amazon/src/creatorsSearch');
const { normalizeAmazonItem } = require('../providers/live/amazon/src/normalize');
const { TrackedUrlError } = require('../shared/links/buildTrackedUrl');
const { run } = require('../providers/live/amazon/src/worker');

const envVars = { AMAZON_PARTNER_TAG: 'tag-20' };

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

describe('FR-185 Creators tracked-link parity', () => {
  it('stampAmazonTrackedUrl stamps userId + tag for Creators detail URLs', () => {
    const url = 'https://www.amazon.co.uk/dp/B0CREATOR1';
    const a = stampAmazonTrackedUrl({
      url,
      userId: 'U-A',
      env: 'sandbox',
      envVars,
    });
    const b = stampAmazonTrackedUrl({
      url,
      userId: 'U-B',
      env: 'sandbox',
      envVars,
    });
    assert.match(a, /tag=tag-20/);
    assert.match(b, /tag=tag-20/);
    assert.doesNotMatch(a, /[?&]userId=/);
  });

  it('Creators normalize stamps same rules as PA-API normalize', () => {
    const creators = JSON.parse(fs.readFileSync(creatorsFixture, 'utf8'));
    const paapi = JSON.parse(fs.readFileSync(paapiFixture, 'utf8'));
    const c = normalizeCreatorsResponse(creators, {
      userId: 'U-A',
      env: 'sandbox',
      envVars,
    })[0];
    const p = normalizeAmazonItem(paapi.SearchResult.Items[0], {
      userId: 'U-A',
      env: 'sandbox',
      envVars,
    });
    assert.match(c.url, /tag=tag-20/);
    assert.match(p.url, /tag=tag-20/);
    assert.doesNotMatch(c.url, /[?&]userId=/);
    assert.doesNotMatch(p.url, /[?&]userId=/);
    assert.match(c.url, /^https:\/\/www\.amazon\.co\.uk\/dp\/B0CREATOR1/);
  });

  it('empty userId fails closed for Creators normalize', () => {
    const creators = JSON.parse(fs.readFileSync(creatorsFixture, 'utf8'));
    assert.throws(
      () =>
        normalizeCreatorsResponse(creators, {
          userId: '',
          env: 'sandbox',
          envVars,
        }),
      TrackedUrlError,
    );
  });

  it('worker Creators path results include tenant stamp', async () => {
    const fixture = JSON.parse(fs.readFileSync(creatorsFixture, 'utf8'));
    const credEnv = {
      A_SEARCH_ENV: 'sandbox',
      AMAZON_SEARCH_API: 'creators',
      AMAZON_CREATORS_CREDENTIAL: 'FAKE_CREATORS_CREDENTIAL',
      AMAZON_PARTNER_TAG: 'tag-20',
      AMAZON_CREATORS_ENDPOINT: 'https://example.test/creators/v1/search',
      S3_RESULTS_BUCKET: 'test-results',
    };
    const out = await run(
      {
        searchId: 'srch_185',
        userId: 'U-A',
        env: 'sandbox',
        source: 'amazon',
        q: 'headphones',
        catalogId: 1,
      },
      {
        env: credEnv,
        httpRequest: async () => fixture,
        putObject: async () => ({ ETag: '"x"' }),
      },
    );
    assert.equal(out.searchApi, 'creators');
    assert.match(out.products[0].url, /tag=tag-20/);
    assert.doesNotMatch(out.products[0].url, /[?&]userId=/);
  });

  it('FR-185 Decision LOCKED + tracked-links Creators parity', () => {
    const fr = utf8NoBom('docs/fr/FR-185.md');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /stampAmazonTrackedUrl/);
    assert.match(fr, /AMAZON_PARTNER_TAG/);
    assert.match(fr, /Creators/);
    const docs = utf8NoBom('docs/tracked-links.md');
    assert.match(docs, /Amazon Creators parity \(FR-185\)/);
    assert.match(docs, /stampAmazonTrackedUrl/);
  });
});
