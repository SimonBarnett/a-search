'use strict';

/**
 * FR-102 / #655: shopify normalize + Parts upsert contract (stay dark).
 * No live network / no live SQL; injectable MERGE + recorded fixture.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  DEFAULT_FIXTURE,
  REQUIRED_PARTS_FIELDS,
  normalizeShopifyCatalog,
  normalizeShopifyProduct,
  assertPartsRow,
  readDefaultFixture,
  contentHashForPartsRow,
} = require('../providers/local/shopify/src/normalize');
const {
  upsertShopifyParts,
  shopifyUpsertPartsHook,
  MERGE_SQL,
} = require('../providers/local/shopify/src/upsert');

const meta = {
  source: 'shopify',
  feedKey: 'madeira-demo',
  env: 'sandbox',
};

describe('FR-102 shopify normalize + Parts upsert (stay dark)', () => {
  it('normalize fixture has required Parts fields', () => {
    assert.ok(fs.existsSync(DEFAULT_FIXTURE));
    const fixture = readDefaultFixture();
    const rows = normalizeShopifyCatalog(fixture, meta);
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assertPartsRow(row);
      for (const key of REQUIRED_PARTS_FIELDS) {
        assert.ok(row[key], key);
      }
      assert.equal(row.Source, 'shopify');
      assert.equal(row.FeedKey, 'madeira-demo');
      assert.equal(row.Env, 'sandbox');
      assert.ok(row.ContentHash);
      assert.match(String(row.ContentHash), /^[a-f0-9]{64}$/);
    }
    assert.equal(rows[0].MerchantProductId, '801001');
    assert.equal(rows[0].Title, 'Madeira Sun Hat');
    assert.equal(rows[0].Price, 24.5);
    assert.equal(rows[0].Currency, 'GBP');
    assert.equal(rows[0].Url, '/products/madeira-sun-hat');
    assert.equal(rows[1].MerchantProductId, '801002');
    assert.equal(rows[1].Currency, 'EUR');
  });

  it('skips products missing id or title without throw', () => {
    const rows = normalizeShopifyCatalog(
      {
        products: [
          { id: 1, title: 'Ok' },
          { id: 2, title: '' },
          { title: 'No Id' },
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

    const result = await upsertShopifyParts({
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
    assert.equal(cleared[0].source, 'shopify');
    assert.equal(cleared[0].feedKey, 'madeira-demo');
    assert.equal(cleared[0].env, 'sandbox');
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0].MerchantProductId, '801001');
    assert.equal(loaded[0].Source, 'shopify');
    assert.equal(merged.length, 1);
    assert.equal(merged[0].rowCount, 2);
    assert.equal(result.inserted, 2);
  });

  it('in-memory set-based merge path (no SQL) is stable on second run', async () => {
    const fixture = readDefaultFixture();
    const first = await upsertShopifyParts({
      body: fixture,
      feedKey: 'madeira-demo',
      env: 'sandbox',
    });
    assert.equal(first.inserted, 2);
    assert.equal(first.changed, 2);

    const second = await upsertShopifyParts({
      body: fixture,
      feedKey: 'madeira-demo',
      env: 'sandbox',
      existingParts: first.parts,
    });
    assert.equal(second.changed, 0);
    assert.equal(second.inserted, 0);
    assert.equal(second.updated, 0);
  });

  it('shopifyUpsertPartsHook rejects non-shopify source', async () => {
    await assert.rejects(
      () =>
        shopifyUpsertPartsHook({
          source: 'awin',
          feedKey: 'x',
          env: 'sandbox',
          rows: [],
          runMerge: async () => ({}),
        }),
      /wrong source/,
    );
  });

  it('contentHash changes when title changes', () => {
    const a = normalizeShopifyProduct(
      { id: 9, title: 'A', variants: [{ price: '1' }] },
      meta,
    );
    const b = normalizeShopifyProduct(
      { id: 9, title: 'B', variants: [{ price: '1' }] },
      meta,
    );
    assert.notEqual(a.ContentHash, b.ContentHash);
    assert.equal(a.ContentHash, contentHashForPartsRow(a));
  });

  it('MERGE_SQL contract is set-based', () => {
    assert.match(MERGE_SQL, /\bMERGE\b/i);
    assert.match(MERGE_SQL, /PartsStaging/i);
    assert.doesNotMatch(MERGE_SQL, /WHILE\s*@/i);
  });

  it('registry shopify stays dark', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const s = registry.sources.find((x) => x.id === 'shopify');
    assert.ok(s);
    assert.equal(s.enabled.live, false);
    assert.equal(s.enabled.sandbox, false);
  });

  it('deliverables exist: normalize.js, upsert.js, fixture', () => {
    const base = path.join(root, 'providers', 'local', 'shopify');
    assert.ok(fs.existsSync(path.join(base, 'src', 'normalize.js')));
    assert.ok(fs.existsSync(path.join(base, 'src', 'upsert.js')));
    assert.ok(fs.existsSync(path.join(base, 'fixtures', 'products-ok.json')));
  });
});
