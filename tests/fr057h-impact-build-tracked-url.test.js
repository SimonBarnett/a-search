'use strict';

/**
 * FR-057h: Impact Parts Url → buildTrackedUrl (JWT userId + IMPACT_CAMPAIGN_ID).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  run,
  normalizePart,
} = require('../providers/local/impact/src/worker');
const { TrackedUrlError } = require('../shared/links/buildTrackedUrl');

const root = path.join(__dirname, '..');
const row = {
  Source: 'impact',
  MerchantProductId: 'sku-100',
  Title: 'Mock Impact Headphones',
  Url: 'https://example.test/p/sku-100',
  Price: 19.99,
  Currency: 'GBP',
};

const envVars = { IMPACT_CAMPAIGN_ID: 'camp-77' };

describe('FR-057h impact buildTrackedUrl wiring', () => {
  it('normalizePart stamps userId + subId1 for two tenants', () => {
    const a = normalizePart(row, {
      userId: 'U-A',
      env: 'sandbox',
      envVars,
    });
    const b = normalizePart(row, {
      userId: 'U-B',
      env: 'sandbox',
      envVars,
    });
    assert.match(a.url, /userId=U-A/);
    assert.match(b.url, /userId=U-B/);
    assert.match(a.url, /subId1=camp-77/);
    assert.notEqual(a.url, b.url);
  });

  it('empty userId fails closed', () => {
    assert.throws(
      () =>
        normalizePart(row, {
          userId: '',
          env: 'sandbox',
          envVars,
        }),
      TrackedUrlError,
    );
  });

  it('Url without track context fails closed', () => {
    assert.throws(() => normalizePart(row), /track|userId|tracked/i);
  });

  it('run() results include tenant stamp', async () => {
    const out = await run(
      {
        searchId: 'srch_057h',
        userId: 'U-IMP',
        env: 'sandbox',
        source: 'impact',
        q: 'headphones',
        catalogId: 1,
      },
      {
        env: {
          A_SEARCH_ENV: 'sandbox',
          S3_RESULTS_BUCKET: 'test-results',
          IMPACT_CAMPAIGN_ID: 'camp-77',
        },
        queryParts: async () => [row],
        putObject: async () => ({}),
      },
    );
    assert.match(out.products[0].url, /userId=U-IMP/);
    assert.match(out.products[0].url, /subId1=camp-77/);
  });

  it('impact .env.example documents IMPACT_CAMPAIGN_ID as tracked account key', () => {
    const text = fs.readFileSync(
      path.join(root, 'providers', 'local', 'impact', '.env.example'),
      'utf8',
    );
    assert.match(text, /IMPACT_CAMPAIGN_ID/);
    assert.match(text, /tracked|FR-057|affiliate|account/i);
    assert.match(text, /IMPACT_CAMPAIGN_ID=\s*$/m);
  });
});
