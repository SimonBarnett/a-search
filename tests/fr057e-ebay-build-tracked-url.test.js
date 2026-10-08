'use strict';

/**
 * FR-057e: eBay itemWebUrl → buildTrackedUrl (JWT userId + EBAY_CAMPAIGN_ID).
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
  'ebay',
  'fixtures',
  'item-summary-ok.json',
);
const {
  normalizeEbayItem,
  normalizeSearchResponse,
} = require('../providers/live/ebay/src/normalize');
const { run } = require('../providers/live/ebay/src/worker');
const { TrackedUrlError } = require('../shared/links/buildTrackedUrl');

const envVars = { EBAY_CAMPAIGN_ID: 'camp-42' };

describe('FR-057e ebay buildTrackedUrl wiring', () => {
  it('normalizeEbayItem stamps userId + campid for two tenants', () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const item = fixture.itemSummaries[0];
    const a = normalizeEbayItem(item, {
      userId: 'U-A',
      env: 'sandbox',
      envVars,
    });
    const b = normalizeEbayItem(item, {
      userId: 'U-B',
      env: 'sandbox',
      envVars,
    });
    assert.match(a.url, /userId=U-A/);
    assert.match(b.url, /userId=U-B/);
    assert.match(a.url, /campid=camp-42/);
    assert.notEqual(a.url, b.url);
  });

  it('empty userId fails closed', () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    assert.throws(
      () =>
        normalizeEbayItem(fixture.itemSummaries[0], {
          userId: '',
          env: 'sandbox',
          envVars,
        }),
      TrackedUrlError,
    );
  });

  it('itemWebUrl without track context fails closed', () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    assert.throws(
      () => normalizeSearchResponse(fixture),
      /track|userId|tracked/i,
    );
  });

  it('worker run results include tenant stamp', async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const credEnv = {
      A_SEARCH_ENV: 'sandbox',
      EBAY_CLIENT_ID: 'client-test',
      EBAY_CLIENT_SECRET: 'secret-test',
      EBAY_REFRESH_TOKEN: '',
      EBAY_MARKETPLACE_ID: 'EBAY_GB',
      EBAY_ENV: 'sandbox',
      EBAY_CAMPAIGN_ID: 'camp-42',
      S3_RESULTS_BUCKET: 'test-results',
    };
    const out = await run(
      {
        searchId: 'srch_057e',
        userId: 'U-EBAY',
        env: 'sandbox',
        source: 'ebay',
        q: 'headphones',
        catalogId: 1,
      },
      {
        env: credEnv,
        accessToken: 'tok',
        httpRequest: async (req) => {
          if (String(req.url).includes('item_summary')) return fixture;
          return { access_token: 'tok', expires_in: 7200 };
        },
        putObject: async () => ({}),
      },
    );
    assert.match(out.products[0].url, /userId=U-EBAY/);
    assert.match(out.products[0].url, /campid=camp-42/);
  });

  it('ebay .env.example documents EBAY_CAMPAIGN_ID as tracked account key', () => {
    const text = fs.readFileSync(
      path.join(root, 'providers', 'live', 'ebay', '.env.example'),
      'utf8',
    );
    assert.match(text, /EBAY_CAMPAIGN_ID/);
    assert.match(text, /tracked|FR-057|affiliate|account/i);
    assert.match(text, /EBAY_CAMPAIGN_ID=\s*$/m);
  });
});
