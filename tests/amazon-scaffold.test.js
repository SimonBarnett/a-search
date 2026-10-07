'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const amazon = path.join(root, 'providers', 'live', 'amazon');

const REQUIRED = [
  'AGENTS.md',
  path.join('.grok', 'skills', 'a-search-amazon', 'SKILL.md'),
  '.env.example',
  path.join('src', 'worker.js'),
];

describe('FR-016 amazon provider scaffold', () => {
  it('layout paths exist', () => {
    for (const rel of REQUIRED) {
      const p = path.join(amazon, rel);
      assert.ok(
        fs.existsSync(p),
        `missing ${path.join('providers/live/amazon', rel)}`,
      );
    }
  });

  it('stub run(msg) is callable', async () => {
    const { run } = require('../providers/live/amazon/src/worker');
    assert.equal(typeof run, 'function');
    const out = await run({
      searchId: 'srch_test',
      userId: 'U1',
      env: 'sandbox',
      source: 'amazon',
      q: 'headphones',
      catalogId: 1,
      category: 'Electronics',
      subcategory: 'Headphones',
    });
    assert.ok(out);
    assert.equal(out.ok, true);
    assert.equal(out.source, 'amazon');
  });
});
