'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cj = path.join(__dirname, '..', 'providers', 'live', 'cj');

const REQUIRED = [
  'AGENTS.md',
  path.join('.grok', 'skills', 'a-search-cj', 'SKILL.md'),
  '.env.example',
  path.join('src', 'worker.js'),
];

describe('FR-019 cj provider scaffold', () => {
  it('layout paths exist', () => {
    for (const rel of REQUIRED) {
      const p = path.join(cj, rel);
      assert.ok(fs.existsSync(p), `missing ${path.join('providers/live/cj', rel)}`);
    }
  });

  it('skill mentions ads.api.cj.com', () => {
    const text = fs.readFileSync(
      path.join(cj, '.grok', 'skills', 'a-search-cj', 'SKILL.md'),
      'utf8',
    );
    assert.match(text, /ads\.api\.cj\.com/i);
  });

  it('stub exports run()', async () => {
    const { run } = require('../providers/live/cj/src/worker');
    assert.equal(typeof run, 'function');
    const out = await run({
      searchId: 'srch_cj',
      userId: 'U1',
      env: 'sandbox',
      source: 'cj',
      q: 'laptop',
      catalogId: 1,
      category: 'Electronics',
      subcategory: 'Computers',
    });
    assert.equal(out.ok, true);
    assert.equal(out.source, 'cj');
  });
});
