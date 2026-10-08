'use strict';

/**
 * FR-106 / #659: wix normalize + Parts upsert contract (stay dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  DEFAULT_FIXTURE,
  REQUIRED_PARTS_FIELDS,
  normalizeWixCatalog,
  normalizeWixProduct,
  assertPartsRow,
  readDefaultFixture,
  contentHashForPartsRow,
} = require('../providers/local/wix/src/normalize');
const {
  upsertWixParts,
  wixUpsertPartsHook,
  MERGE_SQL,
} = require('../providers/local/wix/src/upsert');

const meta = {
  source: 'wix',
  feedKey: 'madeira-demo',
  env: 'sandbox',
};

describe('FR-106 wix normalize + Parts upsert (stay dark)', () => {
  it('normalize fixture has required Parts fields', () => {
    assert.ok(fs.existsSync(DEFAULT_FIXTURE));
    const fixture = readDefaultFixture();
    const rows = normalizeWixCatalog(fixture, meta);
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assertPartsRow(row);
      for (const key of REQUIRED_PARTS_FIELDS) {
        assert.ok(row[key], key);
      }
      assert.equal(row.Source, 'wix');
      assert.equal(row.FeedKey, 'madeira-demo');
      assert.equal(row.Env, 'sandbox');
      assert.ok(row.ContentHash);
      assert.match(String(row.ContentHash), /^[a-f0-9]{64}$/);
    }
    assert.equal(rows[0].MerchantProductId, 'wix-prod-801001');
    assert.equal(rows[0].Title, 'Madeira Sun Hat');
    assert.equal(rows[0].Price, 24.5);
    assert.equal(rows[0].Currency, 'GBP');
    assert.match(String(rows[0].Url), /madeira-sun-hat/);
    assert.equal(rows[1].MerchantProductId, 'wix-prod-801002');
    assert.equal(rows[1].Currency, 'EUR');
  });

  it('skips products missing id or title without throw', () => {
    const rows = normalizeWixCatalog(
      {
        products: [
          { id: '1', name: 'Ok' },
          { id: '2', name: '' },
          { name: 'No Id' },
          null,
        ],
      },
      meta,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].MerchantProductId, '1');
  });

  it('upsert unit test with injected SQL (clear/bulkLoad/runMerge)', async () => {
    const fixture = readDefaultFixture();
    const cleared = [];
    const loaded = [];
    const merged = [];

    const result = await upsertWixParts({
      body: fixture,
      feedKey: 'madeira-demo',
      env: 'sandbox',
      clearStaging: async (args) => {
        cleared.push(args);
      },
      bulkLoadStaging: async (rows) => {
        loaded.push(...rows);
      },
      runMerge: async (args) => {
        merged.push(args);
        return { inserted: args.rowCount, updated: 0 };
      },
    });

    assert.equal(cleared.length, 1);
    assert.equal(cleared[0].source, 'wix');
    assert.equal(cleared[0].feedKey, 'madeira-demo');
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0].MerchantProductId, 'wix-prod-801001');
    assert.equal(merged.length, 1);
    assert.equal(merged[0].rowCount, 2);
    assert.equal(result.inserted, 2);
  });

  it('in-memory set-based merge path is stable on second run', async () => {
    const fixture = readDefaultFixture();
    const first = await upsertWixParts({
      body: fixture,
      feedKey: 'madeira-demo',
      env: 'sandbox',
    });
    assert.equal(first.inserted, 2);
    assert.equal(first.changed, 2);

    const second = await upsertWixParts({
      body: fixture,
      feedKey: 'madeira-demo',
      env: 'sandbox',
      existingParts: first.parts,
    });
    assert.equal(second.changed, 0);
    assert.equal(second.inserted, 0);
  });

  it('wixUpsertPartsHook rejects non-wix source', async () => {
    await assert.rejects(
      () =>
        wixUpsertPartsHook({
          source: 'shopify',
          feedKey: 'x',
          env: 'sandbox',
          rows: [],
          runMerge: async () => ({}),
        }),
      /wrong source/,
    );
  });

  it('contentHash changes when title changes', () => {
    const a = normalizeWixProduct(
      { id: '9', name: 'A', priceData: { price: 1, currency: 'GBP' } },
      meta,
    );
    const b = normalizeWixProduct(
      { id: '9', name: 'B', priceData: { price: 1, currency: 'GBP' } },
      meta,
    );
    assert.notEqual(a.ContentHash, b.ContentHash);
    assert.equal(a.ContentHash, contentHashForPartsRow(a));
  });

  it('MERGE_SQL contract is set-based', () => {
    assert.match(MERGE_SQL, /\bMERGE\b/i);
    assert.match(MERGE_SQL, /PartsStaging/i);
  });

  it('registry wix stays dark', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const s = registry.sources.find((x) => x.id === 'wix');
    assert.ok(s);
    assert.equal(s.enabled.live, false);
    assert.equal(s.enabled.sandbox, false);
  });

  it('deliverables exist: normalize.js, upsert.js, fixture', () => {
    const base = path.join(root, 'providers', 'local', 'wix');
    assert.ok(fs.existsSync(path.join(base, 'src', 'normalize.js')));
    assert.ok(fs.existsSync(path.join(base, 'src', 'upsert.js')));
    assert.ok(fs.existsSync(path.join(base, 'fixtures', 'products-ok.json')));
  });
});
