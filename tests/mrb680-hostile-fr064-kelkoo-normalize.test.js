'use strict';

/**
 * MRB #680 hostile: FR-064 kelkoo normalize stay-dark + schema pins.
 * Refs SimonBarnett/a-search#680 / #617
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const normalizePath = path.join(
  root,
  'providers',
  'live',
  'kelkoo',
  'src',
  'normalize.js',
);
const fixturePath = path.join(
  root,
  'providers',
  'live',
  'kelkoo',
  'fixtures',
  'offers-ok.json',
);

describe('MRB #680 hostile FR-064 kelkoo normalize', () => {
  it('exports normalizeKelkooOffer and filters partial offers', () => {
    const mod = require(normalizePath);
    assert.equal(typeof mod.normalizeKelkooOffer, 'function');
    assert.equal(typeof mod.normalizeSearchResponse, 'function');
    const track = {
      userId: 'U-KK',
      env: 'sandbox',
      envVars: {
        A_SEARCH_ENV: 'sandbox',
        KELKOO_PUBLISHER_ID: 'pub-test',
      },
    };
    const products = mod.normalizeSearchResponse(
      {
        offers: [
          { offerId: 'a', title: 'A', landingPageUrl: 'https://x.test/a' },
          { offerId: '', title: 'skip' },
          null,
        ],
      },
      track,
    );
    assert.equal(products.length, 1);
    assert.equal(products[0].id, 'a');
    assert.equal(products[0].source, 'kelkoo');
  });

  it('fixture products keep merchantName as description; stay-dark registry', () => {
    const { normalizeSearchResponse } = require(normalizePath);
    const { assertProductSchema } = require('../worker/lib/normalizeProduct');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const track = {
      userId: 'U-KK',
      env: 'sandbox',
      envVars: {
        A_SEARCH_ENV: 'sandbox',
        KELKOO_PUBLISHER_ID: 'pub-test',
      },
    };
    const products = normalizeSearchResponse(fixture, track);
    assert.equal(products[0].description, 'Fixture Merchant A');
    for (const p of products) assertProductSchema(p);

    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const kk = registry.sources.find((s) => s.id === 'kelkoo');
    assert.equal(kk.enabled.live, false);
    assert.equal(kk.enabled.sandbox, false);
  });

  it('skill documents FR-064 field map needles', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'live',
        'kelkoo',
        '.grok',
        'skills',
        'a-search-kelkoo',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /FR-064|Normalize/i);
    assert.match(skill, /offerId/);
    assert.match(skill, /landingPageUrl/);
    assert.match(skill, /merchantName/);
  });
});
