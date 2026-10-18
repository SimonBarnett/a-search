'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  finishProviderSearch,
  runSearchWith429Backoff,
} = require('../shared/search/finishProviderSearch');
const { inResultKey } = require('../shared/search/inResultSchema');

const ROOT = path.join(__dirname, '..');
const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ENABLED = ['amazon', 'ebay', 'rakuten', 'cj', 'kelkoo', 'skimlinks', 'etsy'];

describe('FR #4040 finishProviderSearch', () => {
  it('writes a-clubs IN key when hostkey+guid+searchid present', async () => {
    /** @type {object[]} */
    const puts = [];
    const r = await finishProviderSearch({
      msg: {
        hostkey: 'shop.example',
        guid: GUID,
        searchid: 'srch_1',
        env: 'live',
      },
      source: 'ebay',
      products: [{ id: 'p1', title: 'Boot' }],
      putObject: async (args) => {
        puts.push(args);
      },
      touchLastmod: async () => ({ lastmod: 'x' }),
    });
    assert.equal(r.mode, 'a-clubs-in');
    assert.equal(
      r.key,
      inResultKey({
        hostkey: 'shop.example',
        guid: GUID,
        searchid: 'srch_1',
        source: 'ebay',
      }),
    );
    assert.equal(puts.length, 1);
    const body = JSON.parse(puts[0].Body.toString('utf8'));
    assert.equal(body.source, 'ebay');
    assert.equal(body.searchid, 'srch_1');
  });

  it('429 backoff throws retryable http_429_backoff (not silent success)', async () => {
    await assert.rejects(
      () =>
        runSearchWith429Backoff(async () => {
          const err = new Error('throttled');
          err.status = 429;
          err.headers = { 'retry-after': '7' };
          throw err;
        }),
      (e) => e && e.code === 'http_429_backoff' && e.visibilityTimeout === 7,
    );
  });
});

describe('FR #4040 enabled live workers require helpers', () => {
  for (const id of ENABLED) {
    it(`${id} worker requires finishProviderSearch + backoff429 path`, () => {
      const workerPath = path.join(
        ROOT,
        'providers',
        'live',
        id,
        'src',
        'worker.js',
      );
      assert.equal(fs.existsSync(workerPath), true);
      const src = fs.readFileSync(workerPath, 'utf8');
      assert.match(src, /finishProviderSearch/);
      assert.match(src, /runSearchWith429Backoff/);
      assert.match(src, /shared\/search\/finishProviderSearch/);
    });
  }
});
