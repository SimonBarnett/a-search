'use strict';

/**
 * Hostile MRB #714 / FR-075: etsy search stay-dark + fixture/inject gates.
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
const searchPath = path.join(
  root,
  'providers',
  'live',
  'etsy',
  'src',
  'search.js',
);

describe('mrb714 hostile FR-075 etsy search', () => {
  it('fixture is etsyProductAPI.results; UTF-8 no BOM; no secrets', () => {
    const raw = fs.readFileSync(fixturePath);
    assert.equal(raw[0], 0x7b);
    const text = raw.toString('utf8');
    assert.ok(!/sk_live|api[_-]?key\s*[:=]\s*['\"]?[a-z0-9]{20}/i.test(text));
    const fixture = JSON.parse(text);
    assert.ok(Array.isArray(fixture.etsyProductAPI.results));
    assert.equal(fixture.etsyProductAPI.results.length, 2);
    assert.equal(fixture.etsyProductAPI.results[0].listing_id, 10001);
  });

  it('buildListingsSearchUrl hits /application/listings/active', () => {
    const {
      buildListingsSearchUrl,
      DEFAULT_API_BASE,
      assertEtsyCreds,
    } = require(searchPath);
    const creds = assertEtsyCreds({ ETSY_API_KEY: 'k' });
    const url = buildListingsSearchUrl(creds, 'mug');
    assert.match(url, /\/application\/listings\/active/);
    assert.match(url, /keywords=mug/);
    assert.match(DEFAULT_API_BASE, /openapi\.etsy\.com\/v3/);
  });

  it('stay-dark registry; skill/env ASCII; single Search path section', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const et = registry.sources.find((s) => s.id === 'etsy');
    assert.equal(et.enabled.live, false);
    assert.equal(et.enabled.sandbox, false);

    const skill = fs.readFileSync(skillPath, 'utf8');
    assert.ok(!skill.includes('\ufffd'));
    assert.ok(!/\u00c3|\u00e2\u20ac/.test(skill));
    assert.match(skill, /## Search path \(FR-075\)/);
    assert.doesNotMatch(skill, /Live etsy API client lands in a later FR/);
    const env = fs.readFileSync(envPath, 'utf8');
    assert.ok(!env.includes('\ufffd'));
    assert.match(env, /^ETSY_API_KEY=$/m);
  });

  it('ETSY_KEYSTRING alias accepted by assertEtsyCreds', () => {
    const { assertEtsyCreds, readEtsyCreds } = require(searchPath);
    const c = assertEtsyCreds({ ETSY_KEYSTRING: 'alias-key' });
    assert.equal(c.apiKey, 'alias-key');
    assert.equal(readEtsyCreds({}).apiKey, '');
  });
});
