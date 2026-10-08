'use strict';

/**
 * FR-057g: CJ clickUrl → buildTrackedUrl (JWT userId + CJ_WEBSITE_ID).
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
  'cj',
  'fixtures',
  'products-ok.json',
);
const {
  normalizeCjItem,
  normalizeSearchResponse,
} = require('../providers/live/cj/src/normalize');
const { run } = require('../providers/live/cj/src/worker');
const { TrackedUrlError } = require('../shared/links/buildTrackedUrl');

const envVars = { CJ_WEBSITE_ID: 'web-9' };

describe('FR-057g cj buildTrackedUrl wiring', () => {
  it('normalizeCjItem stamps userId + sid for two tenants', () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const item = fixture.data.products.resultList[0];
    const a = normalizeCjItem(item, {
      userId: 'U-A',
      env: 'sandbox',
      envVars,
    });
    const b = normalizeCjItem(item, {
      userId: 'U-B',
      env: 'sandbox',
      envVars,
    });
    assert.match(a.url, /userId=U-A/);
    assert.match(b.url, /userId=U-B/);
    assert.match(a.url, /sid=web-9/);
    assert.notEqual(a.url, b.url);
  });

  it('empty userId fails closed', () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    assert.throws(
      () =>
        normalizeCjItem(fixture.data.products.resultList[0], {
          userId: '',
          env: 'sandbox',
          envVars,
        }),
      TrackedUrlError,
    );
  });

  it('clickUrl without track context fails closed', () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    assert.throws(
      () => normalizeSearchResponse(fixture),
      /track|userId|tracked/i,
    );
  });

  it('worker run results include tenant stamp', async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const out = await run(
      {
        searchId: 'srch_057g',
        userId: 'U-CJ',
        env: 'sandbox',
        source: 'cj',
        q: 'laptop',
        catalogId: 1,
      },
      {
        env: {
          A_SEARCH_ENV: 'sandbox',
          CJ_API_TOKEN: 'token-test',
          CJ_GRAPHQL_URL: 'https://ads.api.cj.com/query',
          CJ_WEBSITE_ID: 'web-9',
          S3_RESULTS_BUCKET: 'test-results',
        },
        httpRequest: async () => fixture,
        putObject: async () => ({}),
      },
    );
    assert.match(out.products[0].url, /userId=U-CJ/);
    assert.match(out.products[0].url, /sid=web-9/);
  });

  it('cj .env.example documents CJ_WEBSITE_ID as tracked account key', () => {
    const text = fs.readFileSync(
      path.join(root, 'providers', 'live', 'cj', '.env.example'),
      'utf8',
    );
    assert.match(text, /CJ_WEBSITE_ID/);
    assert.match(text, /tracked|FR-057|affiliate|account/i);
    assert.match(text, /CJ_WEBSITE_ID=\s*$/m);
  });
});
