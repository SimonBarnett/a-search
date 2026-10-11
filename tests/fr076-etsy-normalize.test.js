'use strict';

/**
 * FR-076: etsy normalize.js → shared product schema (enabled FR-170).
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
  'etsy',
  'fixtures',
  'listings-ok.json',
);
const normalizePath = path.join(
  root,
  'providers',
  'live',
  'etsy',
  'src',
  'normalize.js',
);

const track = {
  userId: 'U-ET',
  env: 'sandbox',
  envVars: {
    A_SEARCH_ENV: 'sandbox',
    ETSY_TRACKING_ID: 'track-test',
  },
};

describe('FR-076 etsy normalize', () => {
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
      assert.equal(p.source, 'etsy');
      assert.ok(p.id);
      assert.ok(p.title);
    }
    assert.equal(products[0].id, '10001');
    assert.equal(products[0].title, 'Fixture Handmade Ceramic Mug');
    assert.equal(products[0].price, 18.5);
    assert.equal(products[0].currency, 'GBP');
    assert.match(String(products[0].url), /example\.test\/etsy/);
    assert.equal(products[0].description, 'Fixture listing A');
    assert.match(String(products[0].imageUrl), /etsy-10001/);
  });

  it('empty/partial payloads yield empty or filtered products without throw', () => {
    const { normalizeSearchResponse, normalizeEtsyListing } = require(
      normalizePath,
    );
    assert.deepEqual(normalizeSearchResponse(null, track), []);
    assert.deepEqual(normalizeSearchResponse({}, track), []);
    assert.deepEqual(
      normalizeSearchResponse({ etsyProductAPI: { results: [] } }, track),
      [],
    );
    assert.deepEqual(
      normalizeSearchResponse(
        {
          etsyProductAPI: {
            results: [{ listing_id: '', title: 'x' }, { title: 'no-id' }, null],
          },
        },
        track,
      ),
      [],
    );
    const partial = normalizeEtsyListing({ listing_id: 9 }, track);
    assert.equal(partial.id, '9');
    assert.equal(partial.title, '');
    assert.equal(partial.source, 'etsy');
  });

  it('registry keeps etsy enabled.live and enabled.sandbox true (FR-170)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const et = registry.sources.find((s) => s.id === 'etsy');
    assert.ok(et);
    assert.equal(et.enabled.live, true);
    assert.equal(et.enabled.sandbox, true);
  });
});
