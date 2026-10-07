'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ebay = path.join(__dirname, '..', 'providers', 'live', 'ebay');

const REQUIRED = [
  'AGENTS.md',
  path.join('.grok', 'skills', 'a-search-ebay', 'SKILL.md'),
  '.env.example',
  path.join('src', 'worker.js'),
];

describe('FR-017 ebay provider scaffold', () => {
  it('layout paths exist', () => {
    for (const rel of REQUIRED) {
      const p = path.join(ebay, rel);
      assert.ok(fs.existsSync(p), `missing ${path.join('providers/live/ebay', rel)}`);
    }
  });

  it('stub exports run()', async () => {
    const { run } = require('../providers/live/ebay/src/worker');
    assert.equal(typeof run, 'function');
    const out = await run({
      searchId: 'srch_ebay',
      userId: 'U1',
      env: 'sandbox',
      source: 'ebay',
      q: 'camera',
      catalogId: 1,
      category: 'Electronics',
      subcategory: 'Cameras',
    });
    assert.equal(out.ok, true);
    assert.equal(out.source, 'ebay');
  });
});
