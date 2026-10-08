'use strict';

/**
 * FR-110 / #663: woocommerce normalize + Parts upsert contract (stay dark).
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
  normalizeWooCommerceCatalog,
  normalizeWooCommerceProduct,
  assertPartsRow,
  readDefaultFixture,
  contentHashForPartsRow,
} = require('../providers/local/woocommerce/src/normalize');
const {
  upsertWooCommerceParts,
  woocommerceUpsertPartsHook,
  MERGE_SQL,
} = require('../providers/local/woocommerce/src/upsert');

const meta = {
  source: 'woocommerce',
  feedKey: 'madeira-demo',
  env: 'sandbox',
};

describe('FR-110 woocommerce normalize + Parts upsert (stay dark)', () => {
  it('normalize fixture has required Parts fields', () => {
    assert.ok(fs.existsSync(DEFAULT_FIXTURE));
    const fixture = readDefaultFixture();
    const rows = normalizeWooCommerceCatalog(fixture, meta);
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assertPartsRow(row);
      for (const key of REQUIRED_PARTS_FIELDS) {
        assert.ok(row[key], key);
      }
      assert.equal(row.Source, 'woocommerce');
      assert.equal(row.FeedKey, 'madeira-demo');
      assert.equal(row.Env, 'sandbox');
      assert.ok(row.ContentHash);
      assert.match(String(row.ContentHash), /^[a-f0-9]{64}$/);
    }
    assert.equal(rows[0].MerchantProductId, '801001');
    assert.equal(rows[0].Title, 'Madeira Sun Hat');
    assert.equal(rows[0].Price, 24.5);
    assert.equal(rows[0].Currency, 'GBP');
    assert.match(String(rows[0].Url), /madeira-sun-hat/);
    assert.equal(rows[1].MerchantProductId, '801002');
    assert.equal(rows[1].Currency, 'EUR');
  });

  it('skips products missing id or title without throw', () => {
    const rows = normalizeWooCommerceCatalog(
      {
        products: [
          { id: 1, name: 'Ok' },
          { id: 2, name: '' },
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

    const result = await upsertWooCommerceParts({
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
    assert.equal(cleared[0].source, 'woocommerce');
    assert.equal(cleared[0].feedKey, 'madeira-demo');
    assert.equal(cleared[0].env, 'sandbox');
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0].MerchantProductId, '801001');
    assert.equal(loaded[0].Source, 'woocommerce');
    assert.equal(merged.length, 1);
    assert.equal(merged[0].rowCount, 2);
    assert.equal(result.inserted, 2);
  });

  it('in-memory set-based merge path (no SQL) is stable on second run', async () => {
    const fixture = readDefaultFixture();
    const first = await upsertWooCommerceParts({
      body: fixture,
      feedKey: 'madeira-demo',
      env: 'sandbox',
    });
    assert.equal(first.inserted, 2);
    assert.equal(first.changed, 2);

    const second = await upsertWooCommerceParts({
      body: fixture,
      feedKey: 'madeira-demo',
      env: 'sandbox',
      existingParts: first.parts,
    });
    assert.equal(second.changed, 0);
    assert.equal(second.inserted, 0);
    assert.equal(second.updated, 0);
  });

  it('woocommerceUpsertPartsHook rejects non-woocommerce source', async () => {
    await assert.rejects(
      () =>
        woocommerceUpsertPartsHook({
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
    const a = normalizeWooCommerceProduct(
      { id: 9, name: 'A', price: '1' },
      meta,
    );
    const b = normalizeWooCommerceProduct(
      { id: 9, name: 'B', price: '1' },
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

  it('registry woocommerce stays dark', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const s = registry.sources.find((x) => x.id === 'woocommerce');
    assert.ok(s);
    assert.equal(s.enabled.live, false);
    assert.equal(s.enabled.sandbox, false);
  });

  it('deliverables exist: normalize.js, upsert.js, fixture', () => {
    const dir = path.join(root, 'providers', 'local', 'woocommerce');
    assert.ok(fs.existsSync(path.join(dir, 'src', 'normalize.js')));
    assert.ok(fs.existsSync(path.join(dir, 'src', 'upsert.js')));
    assert.ok(fs.existsSync(path.join(dir, 'fixtures', 'products-ok.json')));
  });

  it('skill documents normalize + upsert (FR-110)', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'woocommerce',
        '.grok',
        'skills',
        'a-search-woocommerce',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /## Normalize \+ upsert \(FR-110\)/);
    assert.match(skill, /normalize\.js/);
    assert.match(skill, /upsert\.js/);
    assert.match(skill, /ContentHash/);
    assert.ok(!skill.includes('\ufffd'));
  });
});
