'use strict';

/**
 * MRB #874 hostile pins for FR-110 woocommerce normalize + Parts upsert (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  normalizeWooCommerceCatalog,
  assertPartsRow,
  readDefaultFixture,
  REQUIRED_PARTS_FIELDS,
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

describe('MRB-874 FR-110 hostile', () => {
  it('registry woocommerce stay-dark both envs (CAST IRON)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const row = registry.sources.find((s) => s.id === 'woocommerce');
    assert.ok(row);
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
  });

  it('normalize fixture yields required Parts fields + ContentHash', () => {
    const rows = normalizeWooCommerceCatalog(readDefaultFixture(), meta);
    assert.ok(rows.length >= 2);
    for (const row of rows) {
      assertPartsRow(row);
      for (const key of REQUIRED_PARTS_FIELDS) {
        assert.ok(row[key], key);
      }
      assert.equal(row.Source, 'woocommerce');
      assert.match(String(row.ContentHash), /^[a-f0-9]{64}$/);
    }
  });

  it('upsertWooCommerceParts uses injected clear/bulkLoad/runMerge (no live SQL)', async () => {
    const cleared = [];
    const loaded = [];
    const merged = [];
    const fixture = readDefaultFixture();
    const result = await upsertWooCommerceParts({
      body: fixture,
      ...meta,
      clearStaging: async (args) => {
        cleared.push(args);
      },
      bulkLoadStaging: async (rows) => {
        loaded.push(rows);
      },
      runMerge: async (args) => {
        merged.push(args);
        return { rowsAffected: loaded[0] ? loaded[0].length : 0 };
      },
    });
    assert.equal(cleared.length, 1);
    assert.equal(loaded.length, 1);
    assert.ok(loaded[0].length >= 2);
    assert.equal(merged.length, 1);
    assert.ok(result);
  });

  it('woocommerceUpsertPartsHook rejects wrong source', async () => {
    await assert.rejects(
      () =>
        woocommerceUpsertPartsHook({
          source: 'shopify',
          feedKey: 'x',
          env: 'sandbox',
          rows: [],
        }),
      /wrong source/,
    );
  });

  it('MERGE_SQL pins dbo.Parts set-based MERGE', () => {
    assert.match(MERGE_SQL, /MERGE/i);
    assert.match(MERGE_SQL, /dbo\.Parts|PartsStaging/i);
  });

  it('skill keep-both FR-109 + FR-110; worker stub; ASCII', () => {
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
    assert.match(skill, /## Catalogue client \(FR-109\)/);
    assert.match(skill, /## Normalize \+ upsert \(FR-110\)/);
    assert.match(skill, /normalize\.js/);
    assert.match(skill, /upsert\.js/);
    assert.match(skill, /catalog\.js/);
    assert.match(skill, /stay dark|enabled.*false/i);
    assert.ok(!skill.includes('\ufffd'));
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(skill));
    const worker = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'woocommerce',
        'src',
        'worker.js',
      ),
      'utf8',
    );
    assert.doesNotMatch(
      worker,
      /upsertWooCommerceParts|normalizeWooCommerceCatalog/,
    );
  });
});
