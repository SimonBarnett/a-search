'use strict';

/**
 * Hostile MRB #720 / FR-079: bol search stay-dark + fixture/inject gates.
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
const searchPath = path.join(
  root,
  'providers',
  'live',
  'bol',
  'src',
  'search.js',
);

describe('mrb720 hostile FR-079 bol search', () => {
  it('fixture is bolProductAPI.products; UTF-8 no BOM; no secrets', () => {
    const raw = fs.readFileSync(fixturePath);
    assert.equal(raw[0], 0x7b);
    const text = raw.toString('utf8');
    assert.ok(!/sk_live|api[_-]?key\s*[:=]\s*['\"]?[a-z0-9]{20}/i.test(text));
    const fixture = JSON.parse(text);
    assert.ok(Array.isArray(fixture.bolProductAPI.products));
    assert.equal(fixture.bolProductAPI.products.length, 2);
    assert.equal(fixture.bolProductAPI.products[0].id, 'bol-fix-001');
  });

  it('buildCatalogSearchUrl hits /catalog/v4/search with X-API-KEY path', () => {
    const {
      buildCatalogSearchUrl,
      DEFAULT_API_BASE,
      assertBolCreds,
      searchBol,
    } = require(searchPath);
    const creds = assertBolCreds({ BOL_API_KEY: 'k' });
    const url = buildCatalogSearchUrl(creds, 'earbuds');
    assert.match(url, /\/catalog\/v4\/search/);
    assert.match(url, /q=earbuds/);
    assert.match(DEFAULT_API_BASE, /api\.bol\.com/);
  });

  it('enabled FR-171 registry; skill/env ASCII; single Search path section', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const bol = registry.sources.find((s) => s.id === 'bol');
    assert.equal(bol.enabled.live, true);
    assert.equal(bol.enabled.sandbox, true);

    const skill = fs.readFileSync(skillPath, 'utf8');
    assert.ok(!skill.includes('\ufffd'));
    assert.ok(!/\u00c3|\u00e2\u20ac/.test(skill));
    assert.match(skill, /## Search path \(FR-079\)/);
    assert.match(skill, /bolProductAPI/);
    const env = fs.readFileSync(envPath, 'utf8');
    assert.ok(!env.includes('\ufffd'));
    assert.match(env, /^BOL_API_KEY=$/m);
  });

  it('BOL_CLIENT_ID alias accepted; missing key throws before HTTP', async () => {
    const { assertBolCreds, searchBol, BolCredsError } = require(searchPath);
    assert.equal(assertBolCreds({ BOL_CLIENT_ID: 'alias-key' }).apiKey, 'alias-key');
    await assert.rejects(
      () =>
        searchBol(
          { q: 'x' },
          {
            env: { A_SEARCH_ENV: 'sandbox' },
            httpRequest: async () => {
              throw new Error('should not call');
            },
          },
        ),
      (err) => err instanceof BolCredsError || err.code === 'bol_missing_credentials',
    );
  });
});
