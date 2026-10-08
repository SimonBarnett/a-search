'use strict';

/**
 * Hostile MRB #721 / FR-080: bol normalize stay-dark + bolProductAPI fixture.
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
  'bol',
  'fixtures',
  'products-ok.json',
);
const normalizePath = path.join(
  root,
  'providers',
  'live',
  'bol',
  'src',
  'normalize.js',
);
const skillPath = path.join(
  root,
  'providers',
  'live',
  'bol',
  '.grok',
  'skills',
  'a-search-bol',
  'SKILL.md',
);
const envPath = path.join(root, 'providers', 'live', 'bol', '.env.example');

const track = {
  userId: 'U-MRB721',
  env: 'sandbox',
  envVars: {
    A_SEARCH_ENV: 'sandbox',
    BOL_TRACKING_ID: 'mrb-track',
  },
};

describe('mrb721 hostile FR-080 bol normalize', () => {
  it('productsFromBody reads bolProductAPI and top-level products', () => {
    const { productsFromBody, normalizeSearchResponse } = require(normalizePath);
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    assert.equal(productsFromBody(fixture).length, 2);
    assert.equal(
      productsFromBody({ products: fixture.bolProductAPI.products }).length,
      2,
    );
    const products = normalizeSearchResponse(fixture, track);
    assert.equal(products.length, 2);
    assert.equal(products[0].price, 19.99);
    assert.equal(products[0].currency, 'EUR');
    assert.equal(products[0].source, 'bol');
    assert.equal(products[0].description, 'Fixture Bol Shop A');
  });

  it('stay-dark; skill FR-080 ASCII; BOL_TRACKING_ID in env', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const bol = registry.sources.find((s) => s.id === 'bol');
    assert.equal(bol.enabled.live, false);
    assert.equal(bol.enabled.sandbox, false);

    const skill = fs.readFileSync(skillPath, 'utf8');
    assert.ok(!skill.includes('\ufffd'));
    assert.ok(!/\u00c3|\u00e2\u20ac/.test(skill));
    assert.match(skill, /## Normalize \(FR-080\)/);
    assert.match(skill, /BOL_TRACKING_ID/);
    assert.match(skill, /offerPrice/);

    const env = fs.readFileSync(envPath, 'utf8');
    assert.ok(!env.includes('\ufffd'));
    assert.match(env, /^BOL_TRACKING_ID=$/m);
  });

  it('missing track throws TrackedUrlError when url present', () => {
    const { normalizeBolProduct, TrackedUrlError } = require(normalizePath);
    assert.throws(
      () =>
        normalizeBolProduct({
          id: 'x',
          title: 't',
          url: 'https://example.test/bol/x',
        }),
      TrackedUrlError,
    );
  });

  it('fixture UTF-8 no BOM', () => {
    const raw = fs.readFileSync(fixturePath);
    assert.equal(raw[0], 0x7b);
  });
});
