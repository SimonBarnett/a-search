'use strict';

/**
 * MRB #703 hostile: FR-071 aliexpress search stay-dark gates.
 * Refs SimonBarnett/a-search#703 / #624
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('MRB #703 hostile FR-071 aliexpress search', () => {
  it('search exports and fixture uses aliexpressProductAPI.products', async () => {
    const {
      searchAliexpress,
      DEFAULT_API_BASE,
      AliexpressCredsError,
    } = require('../providers/live/aliexpress/src/search');
    assert.equal(typeof searchAliexpress, 'function');
    assert.match(String(DEFAULT_API_BASE), /aliexpress/i);
    const fixture = JSON.parse(
      fs.readFileSync(
        path.join(root, 'providers/live/aliexpress/fixtures/products-ok.json'),
        'utf8',
      ),
    );
    assert.ok(Array.isArray(fixture.aliexpressProductAPI.products));
    const out = await searchAliexpress(
      { q: 'earbuds', env: 'sandbox' },
      {
        env: { ALIEXPRESS_API_KEY: 'k', ALIEXPRESS_TRACKING_ID: 't' },
        httpRequest: async () => fixture,
      },
    );
    assert.equal(out.aliexpressProductAPI.products[0].product_id, 'ae-fix-001');
  });

  it('missing creds throw; registry stay-dark', async () => {
    const {
      searchAliexpress,
      AliexpressCredsError,
    } = require('../providers/live/aliexpress/src/search');
    await assert.rejects(
      () => searchAliexpress({ q: 'x' }, { env: {} }),
      (err) =>
        err instanceof AliexpressCredsError ||
        err.code === 'aliexpress_missing_credentials',
    );
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers/registry.json'), 'utf8'),
    );
    const ae = registry.sources.find((s) => s.id === 'aliexpress');
    assert.equal(ae.enabled.live, false);
    assert.equal(ae.enabled.sandbox, false);
  });

  it('skill documents FR-071 search needles', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers/live/aliexpress/.grok/skills/a-search-aliexpress/SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /FR-071|Search path/i);
    assert.match(skill, /search\.js/);
    assert.match(skill, /aliexpressProductAPI|product\.query/i);
  });
});
