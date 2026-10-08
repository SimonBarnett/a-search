'use strict';

/**
 * FR-072: aliexpress normalize.js -> shared product schema (stay-dark).
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
  'aliexpress',
  'fixtures',
  'products-ok.json',
);
const normalizePath = path.join(
  root,
  'providers',
  'live',
  'aliexpress',
  'src',
  'normalize.js',
);

const track = {
  userId: 'U-AE',
  env: 'sandbox',
  envVars: {
    A_SEARCH_ENV: 'sandbox',
    ALIEXPRESS_TRACKING_ID: 'track-test',
  },
};

describe('FR-072 aliexpress normalize', () => {
  it('normalize.js and recorded fixture exist', () => {
    assert.ok(fs.existsSync(normalizePath));
    assert.ok(fs.existsSync(fixturePath));
  });

  it('normalize(fixture) passes assertProductSchema with required fields', () => {
    const { normalizeSearchResponse } = require(normalizePath);
    const { assertProductSchema } = require('../worker/lib/normalizeProduct');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    assert.ok(fixture.aliexpressProductAPI);
    const products = normalizeSearchResponse(fixture, track);
    assert.equal(products.length, 2);
    for (const p of products) {
      assertProductSchema(p);
      assert.equal(p.source, 'aliexpress');
      assert.ok(p.id);
      assert.ok(p.title);
    }
    assert.equal(products[0].id, 'ae-fix-001');
    assert.equal(products[0].title, 'Fixture Wireless Earbuds');
    assert.equal(products[0].price, 19.99);
    assert.equal(products[0].currency, 'GBP');
    assert.match(String(products[0].url), /example\.test\/aliexpress/);
    assert.equal(products[0].description, 'Fixture AE Shop A');
  });

  it('empty/partial payloads yield empty or filtered products without throw', () => {
    const { normalizeSearchResponse, normalizeAliexpressProduct } = require(
      normalizePath,
    );
    assert.deepEqual(normalizeSearchResponse(null, track), []);
    assert.deepEqual(normalizeSearchResponse({}, track), []);
    assert.deepEqual(
      normalizeSearchResponse({ aliexpressProductAPI: { products: [] } }, track),
      [],
    );
    assert.deepEqual(
      normalizeSearchResponse(
        {
          aliexpressProductAPI: {
            products: [
              { product_id: '', product_title: 'x' },
              { product_title: 'no-id' },
              null,
            ],
          },
        },
        track,
      ),
      [],
    );
    const partial = normalizeAliexpressProduct(
      { product_id: 'only-id' },
      track,
    );
    assert.equal(partial.id, 'only-id');
    assert.equal(partial.title, '');
    assert.equal(partial.source, 'aliexpress');
  });

  it('registry keeps aliexpress enabled.live and enabled.sandbox false', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const ae = registry.sources.find((s) => s.id === 'aliexpress');
    assert.ok(ae);
    assert.equal(ae.enabled.live, false);
    assert.equal(ae.enabled.sandbox, false);
  });
});
