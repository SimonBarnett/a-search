'use strict';

/**
 * FR-064: kelkoo normalize.js → shared product schema (stay-dark).
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
  'kelkoo',
  'fixtures',
  'offers-ok.json',
);
const normalizePath = path.join(
  root,
  'providers',
  'live',
  'kelkoo',
  'src',
  'normalize.js',
);

describe('FR-064 kelkoo normalize', () => {
  it('normalize.js exists beside search.js', () => {
    assert.ok(fs.existsSync(normalizePath));
    assert.ok(
      fs.existsSync(
        path.join(root, 'providers', 'live', 'kelkoo', 'src', 'search.js'),
      ),
    );
  });

  it('normalize(fixture) passes assertProductSchema with required fields', () => {
    const { normalizeSearchResponse } = require(normalizePath);
    const { assertProductSchema } = require('../worker/lib/normalizeProduct');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const products = normalizeSearchResponse(fixture);
    assert.equal(products.length, 2);
    for (const p of products) {
      assertProductSchema(p);
      assert.equal(p.source, 'kelkoo');
      assert.ok(p.id);
      assert.ok(p.title);
    }
    assert.equal(products[0].id, 'kk-fix-001');
    assert.equal(products[0].title, 'Fixture Ultrabook Laptop');
    assert.equal(products[0].price, 899);
    assert.equal(products[0].currency, 'GBP');
    assert.match(String(products[0].url), /example\.test\/kelkoo/);
    assert.equal(products[0].description, 'Fixture Merchant A');
  });

  it('empty/partial payloads yield empty or filtered products without throw', () => {
    const { normalizeSearchResponse, normalizeKelkooOffer } = require(
      normalizePath,
    );
    assert.deepEqual(normalizeSearchResponse(null), []);
    assert.deepEqual(normalizeSearchResponse({}), []);
    assert.deepEqual(normalizeSearchResponse({ offers: [] }), []);
    assert.deepEqual(
      normalizeSearchResponse({
        offers: [{ offerId: '', title: 'x' }, { title: 'no-id' }, null],
      }),
      [],
    );
    const partial = normalizeKelkooOffer({ offerId: 'only-id' });
    assert.equal(partial.id, 'only-id');
    assert.equal(partial.title, '');
    assert.equal(partial.source, 'kelkoo');
  });

  it('registry keeps kelkoo enabled.live and enabled.sandbox false', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const kk = registry.sources.find((s) => s.id === 'kelkoo');
    assert.ok(kk);
    assert.equal(kk.enabled.live, false);
    assert.equal(kk.enabled.sandbox, false);
  });
});
