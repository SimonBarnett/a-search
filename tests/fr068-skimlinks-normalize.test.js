'use strict';

/**
 * FR-068: skimlinks normalize.js → shared product schema (stay-dark).
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
  'skimlinks',
  'fixtures',
  'products-ok.json',
);
const normalizePath = path.join(
  root,
  'providers',
  'live',
  'skimlinks',
  'src',
  'normalize.js',
);

const track = {
  userId: 'U-SL',
  env: 'sandbox',
  envVars: {
    A_SEARCH_ENV: 'sandbox',
    SKIMLINKS_PUBLISHER_ID: 'pub-test',
  },
};

describe('FR-068 skimlinks normalize', () => {
  it('normalize.js and recorded fixture exist', () => {
    assert.ok(fs.existsSync(normalizePath));
    assert.ok(fs.existsSync(fixturePath));
  });

  it('normalize(fixture) passes assertProductSchema with required fields', () => {
    const { normalizeSearchResponse } = require(normalizePath);
    const { assertProductSchema } = require('../worker/lib/normalizeProduct');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const products = normalizeSearchResponse(fixture, track);
    assert.equal(products.length, 2);
    for (const p of products) {
      assertProductSchema(p);
      assert.equal(p.source, 'skimlinks');
      assert.ok(p.id);
      assert.ok(p.title);
    }
    assert.equal(products[0].id, 'sl-fix-001');
    assert.equal(products[0].title, 'Fixture Wireless Headphones');
    assert.equal(products[0].price, 49.99);
    assert.equal(products[0].currency, 'GBP');
    assert.match(String(products[0].url), /example\.test\/skimlinks/);
    assert.equal(products[0].description, 'Fixture Shop A');
  });

  it('empty/partial payloads yield empty or filtered products without throw', () => {
    const { normalizeSearchResponse, normalizeSkimlinksProduct } = require(
      normalizePath,
    );
    assert.deepEqual(normalizeSearchResponse(null, track), []);
    assert.deepEqual(normalizeSearchResponse({}, track), []);
    assert.deepEqual(normalizeSearchResponse({ products: [] }, track), []);
    assert.deepEqual(
      normalizeSearchResponse(
        {
          products: [{ id: '', title: 'x' }, { title: 'no-id' }, null],
        },
        track,
      ),
      [],
    );
    const partial = normalizeSkimlinksProduct({ id: 'only-id' }, track);
    assert.equal(partial.id, 'only-id');
    assert.equal(partial.title, '');
    assert.equal(partial.source, 'skimlinks');
  });

  it('registry keeps skimlinks enabled.live and enabled.sandbox false', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const sl = registry.sources.find((s) => s.id === 'skimlinks');
    assert.ok(sl);
    assert.equal(sl.enabled.live, false);
    assert.equal(sl.enabled.sandbox, false);
  });
});
