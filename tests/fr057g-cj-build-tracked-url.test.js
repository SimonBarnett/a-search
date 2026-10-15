'use strict';

/**
 * FR-057g + FR-248: CJ clickUrl -> buildTrackedUrl.
 * CJ_WEBSITE_ID is path PID (/click-{PID}-); sid is tenant (not website id).
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

const envVars = { CJ_WEBSITE_ID: '99999' };

describe('FR-057g cj buildTrackedUrl wiring', () => {
  it('normalizeCjItem stamps sid=tenant for two tenants (FR-248)', () => {
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
    assert.match(a.url, /[?&]sid=U-A/);
    assert.match(b.url, /[?&]sid=U-B/);
    assert.doesNotMatch(a.url, /[?&]sid=99999/);
    assert.doesNotMatch(a.url, /[?&]userId=/);
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

  it('worker run results include tenant on sid', async () => {
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
          CJ_WEBSITE_ID: '99999',
          S3_RESULTS_BUCKET: 'test-results',
        },
        httpRequest: async () => fixture,
        putObject: async () => ({}),
      },
    );
    assert.match(out.products[0].url, /[?&]sid=U-CJ/);
    assert.doesNotMatch(out.products[0].url, /[?&]sid=99999/);
  });

  it('cj .env.example documents CJ_WEBSITE_ID as tracked account key', () => {
    const text = fs.readFileSync(
      path.join(root, 'providers', 'live', 'cj', '.env.example'),
      'utf8',
    );
    assert.match(text, /CJ_WEBSITE_ID/);
    assert.match(text, /tracked|FR-057|affiliate|account|FR-248/i);
    assert.match(text, /CJ_WEBSITE_ID=\s*$/m);
  });
});
