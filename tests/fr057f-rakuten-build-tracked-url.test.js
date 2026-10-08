'use strict';

/**
 * FR-057f: Rakuten linkurl → buildTrackedUrl (JWT userId + RAKUTEN_SITE_ID).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  normalizeRakutenItem,
  normalizeSearchItems,
} = require('../providers/live/rakuten/src/normalize');
const { run } = require('../providers/live/rakuten/src/worker');
const { TrackedUrlError } = require('../shared/links/buildTrackedUrl');

const item = {
  productid: 'RK-FIX-001',
  productname: 'Fixture Running Shoes',
  price: '59.99',
  currency: 'GBP',
  linkurl: 'https://www.example.com/rk/RK-FIX-001',
};

const envVars = { RAKUTEN_SITE_ID: 'site-7' };

describe('FR-057f rakuten buildTrackedUrl wiring', () => {
  it('normalizeRakutenItem stamps userId + mid for two tenants', () => {
    const a = normalizeRakutenItem(item, {
      userId: 'U-A',
      env: 'sandbox',
      envVars,
    });
    const b = normalizeRakutenItem(item, {
      userId: 'U-B',
      env: 'sandbox',
      envVars,
    });
    assert.match(a.url, /userId=U-A/);
    assert.match(b.url, /userId=U-B/);
    assert.match(a.url, /mid=site-7/);
    assert.notEqual(a.url, b.url);
  });

  it('empty userId fails closed', () => {
    assert.throws(
      () =>
        normalizeRakutenItem(item, {
          userId: '',
          env: 'sandbox',
          envVars,
        }),
      TrackedUrlError,
    );
  });

  it('linkurl without track context fails closed', () => {
    assert.throws(() => normalizeSearchItems([item]), /track|userId|tracked/i);
  });

  it('worker run results include tenant stamp', async () => {
    const xml = fs.readFileSync(
      path.join(
        root,
        'providers',
        'live',
        'rakuten',
        'fixtures',
        'product-search-ok.xml',
      ),
      'utf8',
    );
    const out = await run(
      {
        searchId: 'srch_057f',
        userId: 'U-RK',
        env: 'sandbox',
        source: 'rakuten',
        q: 'shoes',
        catalogId: 1,
      },
      {
        env: {
          A_SEARCH_ENV: 'sandbox',
          RAKUTEN_APPLICATION_KEY: 'app-key-test',
          RAKUTEN_AFFILIATE_ID: 'aff-1',
          RAKUTEN_SITE_ID: 'site-7',
          RAKUTEN_ENDPOINT: 'https://api.rakuten.com/',
          S3_RESULTS_BUCKET: 'test-results',
        },
        httpRequest: async () => xml,
        putObject: async () => ({}),
      },
    );
    assert.match(out.products[0].url, /userId=U-RK/);
    assert.match(out.products[0].url, /mid=site-7/);
  });

  it('rakuten .env.example documents RAKUTEN_SITE_ID as tracked account key', () => {
    const text = fs.readFileSync(
      path.join(root, 'providers', 'live', 'rakuten', '.env.example'),
      'utf8',
    );
    assert.match(text, /RAKUTEN_SITE_ID/);
    assert.match(text, /tracked|FR-057|affiliate|account/i);
    assert.match(text, /RAKUTEN_SITE_ID=\s*$/m);
  });
});
