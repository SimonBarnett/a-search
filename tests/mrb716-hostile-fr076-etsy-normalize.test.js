'use strict';

/**
 * Hostile MRB #716 / FR-076: etsy normalize stay-dark + etsyProductAPI fixture.
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
const skillPath = path.join(
  root,
  'providers',
  'live',
  'etsy',
  '.grok',
  'skills',
  'a-search-etsy',
  'SKILL.md',
);
const envPath = path.join(root, 'providers', 'live', 'etsy', '.env.example');

const track = {
  userId: 'U-MRB716',
  env: 'sandbox',
  envVars: {
    A_SEARCH_ENV: 'sandbox',
    ETSY_TRACKING_ID: 'mrb-track',
  },
};

describe('mrb716 hostile FR-076 etsy normalize', () => {
  it('listingsFromBody reads etsyProductAPI and top-level results', () => {
    const { listingsFromBody, normalizeSearchResponse, coerceEtsyPrice } =
      require(normalizePath);
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    assert.equal(listingsFromBody(fixture).length, 2);
    assert.equal(
      listingsFromBody({ results: fixture.etsyProductAPI.results }).length,
      2,
    );
    const products = normalizeSearchResponse(fixture, track);
    assert.equal(products.length, 2);
    assert.equal(products[0].price, 18.5);
    assert.equal(products[0].currency, 'GBP');
    assert.equal(products[0].source, 'etsy');
    assert.deepEqual(coerceEtsyPrice({ amount: 199, divisor: 100, currency_code: 'USD' }), {
      price: 1.99,
      currency: 'USD',
    });
  });

  it('enabled FR-170; skill FR-076 ASCII; ETSY_TRACKING_ID in env', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const et = registry.sources.find((s) => s.id === 'etsy');
    assert.equal(et.enabled.live, true);
    assert.equal(et.enabled.sandbox, true);

    const skill = fs.readFileSync(skillPath, 'utf8');
    assert.ok(!skill.includes('\ufffd'));
    assert.ok(!skill.includes('<<<<<<'));
    assert.ok(!/\u00c3|\u00e2\u20ac/.test(skill));
    assert.match(skill, /## Normalize \(FR-076\)/);
    assert.match(skill, /ETSY_TRACKING_ID/);
    assert.doesNotMatch(
      skill,
      /Normalize \(FR-076\) and worker wiring \(FR-077\) are separate later FRs/,
    );

    const env = fs.readFileSync(envPath, 'utf8');
    assert.ok(!env.includes('\ufffd'));
    assert.ok(!env.includes('<<<<<<'));
    assert.match(env, /^ETSY_TRACKING_ID=(a-search)?$/m);
  });

  it('missing track throws TrackedUrlError when url present', () => {
    const { normalizeEtsyListing, TrackedUrlError } = require(normalizePath);
    assert.throws(
      () =>
        normalizeEtsyListing({
          listing_id: 1,
          title: 't',
          url: 'https://example.test/e/1',
        }),
      TrackedUrlError,
    );
  });

  it('fixture UTF-8 no BOM', () => {
    const raw = fs.readFileSync(fixturePath);
    assert.equal(raw[0], 0x7b);
  });
});
