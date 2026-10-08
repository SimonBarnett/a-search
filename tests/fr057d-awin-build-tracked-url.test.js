'use strict';

/**
 * FR-057d: Awin local product URLs go through buildTrackedUrl
 * (JWT userId tenant + AWIN_PUBLISHER_ID from .env).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  run,
  normalizePart,
} = require('../providers/local/awin/src/worker');
const { TrackedUrlError } = require('../shared/links/buildTrackedUrl');

const root = path.join(__dirname, '..');
const envExample = path.join(
  root,
  'providers',
  'local',
  'awin',
  '.env.example',
);

const row = {
  Source: 'awin',
  MerchantProductId: 'sku-100',
  Title: 'Mock Awin Headphones',
  Url: 'https://example.test/p/sku-100',
  Price: 19.99,
  Currency: 'GBP',
};

describe('FR-057d awin buildTrackedUrl wiring', () => {
  it('normalizePart stamps userId + awinaffid for two tenants', () => {
    const envVars = { AWIN_PUBLISHER_ID: 'pub-99' };
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
    assert.match(a.url, /awinaffid=pub-99/);
    assert.notEqual(a.url, b.url);
  });

  it('empty userId fails closed', () => {
    assert.throws(
      () =>
        normalizePart(row, {
          userId: '',
          env: 'sandbox',
          envVars: { AWIN_PUBLISHER_ID: 'pub-99' },
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
        searchId: 'srch_057d',
        userId: 'U-AWIN',
        env: 'sandbox',
        source: 'awin',
        q: 'headphones',
        catalogId: 1,
      },
      {
        env: {
          A_SEARCH_ENV: 'sandbox',
          S3_RESULTS_BUCKET: 'test-results',
          AWIN_PUBLISHER_ID: 'pub-99',
        },
        queryParts: async () => [row],
        putObject: async () => ({}),
      },
    );
    assert.match(out.products[0].url, /userId=U-AWIN/);
    assert.match(out.products[0].url, /awinaffid=pub-99/);
  });

  it('awin .env.example documents AWIN_PUBLISHER_ID as tracked account key', () => {
    const text = fs.readFileSync(envExample, 'utf8');
    assert.match(text, /AWIN_PUBLISHER_ID/);
    assert.match(text, /tracked|FR-057|affiliate|account/i);
    assert.match(text, /AWIN_PUBLISHER_ID=\s*$/m);
  });
});
