'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ebay = path.join(__dirname, '..', 'providers', 'live', 'ebay');

const REQUIRED = [
  'AGENTS.md',
  path.join('.grok', 'skills', 'a-search-ebay', 'SKILL.md'),
  '.env.example',
  path.join('src', 'worker.js'),
];

describe('FR-017 ebay provider scaffold', () => {
  it('layout paths exist', () => {
    for (const rel of REQUIRED) {
      const p = path.join(ebay, rel);
      assert.ok(fs.existsSync(p), `missing ${path.join('providers/live/ebay', rel)}`);
    }
  });

  it('exports run() with Browse search path (not scaffold stub)', async () => {
    const { run } = require('../providers/live/ebay/src/worker');
    assert.equal(typeof run, 'function');
    const fixture = JSON.parse(
      fs.readFileSync(
        path.join(ebay, 'fixtures', 'item-summary-ok.json'),
        'utf8',
      ),
    );
    const out = await run(
      {
        searchId: 'srch_ebay',
        userId: 'U1',
        env: 'sandbox',
        source: 'ebay',
        q: 'camera',
        catalogId: 1,
        category: 'Electronics',
        subcategory: 'Cameras',
      },
      {
        env: {
          A_SEARCH_ENV: 'sandbox',
          EBAY_CLIENT_ID: 'c',
          EBAY_CLIENT_SECRET: 's',
          EBAY_MARKETPLACE_ID: 'EBAY_GB',
          EBAY_CAMPAIGN_ID: 'camp-test',
          S3_RESULTS_BUCKET: 'b',
        },
        accessToken: 't',
        httpRequest: async () => fixture,
        putObject: async () => ({ ETag: '"1"' }),
      },
    );
    assert.equal(out.ok, true);
    assert.equal(out.source, 'ebay');
    assert.ok(Array.isArray(out.products));
    assert.ok(out.products.length >= 1);
    assert.doesNotMatch(JSON.stringify(out), /not wired yet/i);
  });
});
