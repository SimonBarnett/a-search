'use strict';

/**
 * Hostile MRB #705 / FR-072: aliexpress normalize stay-dark + ProductAPI fixture.
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
const skillPath = path.join(
  root,
  'providers',
  'live',
  'aliexpress',
  '.grok',
  'skills',
  'a-search-aliexpress',
  'SKILL.md',
);
const envPath = path.join(
  root,
  'providers',
  'live',
  'aliexpress',
  '.env.example',
);

const track = {
  userId: 'U-MRB705',
  env: 'live',
  envVars: {
    A_SEARCH_ENV: 'live',
    ALIEXPRESS_TRACKING_ID: 'mrb-track',
  },
};

describe('mrb705 hostile FR-072 aliexpress normalize', () => {
  it('fixture is aliexpressProductAPI shape shared with FR-071 search', () => {
    const raw = fs.readFileSync(fixturePath);
    assert.equal(raw[0], 0x7b, 'fixture must be UTF-8 no BOM');
    const fixture = JSON.parse(raw.toString('utf8'));
    assert.ok(Array.isArray(fixture.aliexpressProductAPI.products));
    assert.equal(fixture.aliexpressProductAPI.products.length, 2);
  });

  it('productsFromBody reads aliexpressProductAPI and result wrappers', () => {
    const { productsFromBody, normalizeSearchResponse } = require(normalizePath);
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    assert.equal(productsFromBody(fixture).length, 2);
    assert.equal(
      productsFromBody({ result: { products: fixture.aliexpressProductAPI.products } })
        .length,
      2,
    );
    const products = normalizeSearchResponse(fixture, track);
    assert.equal(products.length, 2);
    assert.equal(products[0].currency, 'GBP');
    assert.equal(products[0].source, 'aliexpress');
    assert.match(String(products[0].url), /example\.test/);
  });

  it('enabled: registry enabled true (FR-169); skill has no mojibake; single TRACKING_ID', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const ae = registry.sources.find((s) => s.id === 'aliexpress');
    assert.equal(ae.enabled.live, true);
    assert.equal(ae.enabled.sandbox, true);

    const skill = fs.readFileSync(skillPath, 'utf8');
    assert.ok(!skill.includes('\ufffd'));
    assert.ok(!/\u00c3|\u00e2\u20ac/.test(skill), 'skill must not contain UTF-8 mojibake');
    assert.match(skill, /aliexpressProductAPI/);
    assert.match(skill, /FR-072/);

    const env = fs.readFileSync(envPath, 'utf8');
    assert.ok(!env.includes('\ufffd'));
    const trackingLines = env
      .split(/\r?\n/)
      .filter((l) => /^ALIEXPRESS_TRACKING_ID=/.test(l));
    assert.equal(trackingLines.length, 1, 'exactly one ALIEXPRESS_TRACKING_ID= line');
  });

  it('missing track context throws TrackedUrlError when url present', () => {
    const { normalizeAliexpressProduct, TrackedUrlError } = require(normalizePath);
    assert.throws(
      () =>
        normalizeAliexpressProduct({
          product_id: 'x',
          product_title: 't',
          promotion_link: 'https://example.test/p',
        }),
      TrackedUrlError,
    );
  });
});
