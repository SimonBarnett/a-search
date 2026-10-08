'use strict';

/**
 * FR-057c: Amazon normalize/worker stamps product.url via buildTrackedUrl
 * (JWT userId tenant + AMAZON_PARTNER_TAG from env).
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
  'search-items-ok.json',
);
const {
  normalizeAmazonItem,
  normalizeSearchResponse,
} = require('../providers/live/amazon/src/normalize');
const { run } = require('../providers/live/amazon/src/worker');
const { TrackedUrlError } = require('../shared/links/buildTrackedUrl');

const envVars = {
  AMAZON_PARTNER_TAG: 'tag-20',
};

describe('FR-057c amazon buildTrackedUrl wiring', () => {
  it('normalizeAmazonItem stamps userId + partner tag on DetailPageURL', () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const item = fixture.SearchResult.Items[0];
    const a = normalizeAmazonItem(item, {
      userId: 'U-A',
      env: 'sandbox',
      envVars,
    });
    const b = normalizeAmazonItem(item, {
      userId: 'U-B',
      env: 'sandbox',
      envVars,
    });
    assert.match(a.url, /userId=U-A/);
    assert.match(b.url, /userId=U-B/);
    assert.match(a.url, /tag=tag-20/);
    assert.notEqual(a.url, b.url);
    assert.match(a.url, /^https:\/\/www\.amazon\.co\.uk\/dp\/B0TESTASIN1/);
  });

  it('empty userId fails closed (TrackedUrlError)', () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const item = fixture.SearchResult.Items[0];
    assert.throws(
      () =>
        normalizeAmazonItem(item, {
          userId: '',
          env: 'sandbox',
          envVars,
        }),
      TrackedUrlError,
    );
  });

  it('worker run results include tenant stamp for two userIds', async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const credEnv = {
      A_SEARCH_ENV: 'sandbox',
      AMAZON_ACCESS_KEY: 'AKIATEST',
      AMAZON_SECRET_KEY: 'secret-test',
      AMAZON_PARTNER_TAG: 'tag-20',
      AMAZON_HOST: 'webservices.amazon.co.uk',
      AMAZON_REGION: 'eu-west-1',
      S3_RESULTS_BUCKET: 'test-results',
    };
    const base = {
      searchId: 'srch_057c',
      env: 'sandbox',
      source: 'amazon',
      q: 'headphones',
      catalogId: 1,
    };
    async function runFor(userId) {
      return run(
        { ...base, userId },
        {
          env: credEnv,
          httpRequest: async () => fixture,
          putObject: async () => ({ ETag: '"x"' }),
        },
      );
    }
    const outA = await runFor('U-A');
    const outB = await runFor('U-B');
    assert.match(outA.products[0].url, /userId=U-A/);
    assert.match(outB.products[0].url, /userId=U-B/);
    assert.match(outA.products[0].url, /tag=tag-20/);
  });

  it('DetailPageURL without track context fails closed', () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    assert.throws(
      () => normalizeSearchResponse(fixture),
      /track|userId|buildTrackedUrl|tracked/i,
    );
  });
});
