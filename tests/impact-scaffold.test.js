'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const impact = path.join(__dirname, '..', 'providers', 'local', 'impact');

const REQUIRED = [
  'AGENTS.md',
  path.join('.grok', 'skills', 'a-search-impact', 'SKILL.md'),
  '.env.example',
  path.join('src', 'worker.js'),
];

describe('FR-021 impact local provider scaffold', () => {
  it('layout paths exist', () => {
    for (const rel of REQUIRED) {
      const p = path.join(impact, rel);
      assert.ok(
        fs.existsSync(p),
        `missing ${path.join('providers/local/impact', rel)}`,
      );
    }
  });

  it('skill mentions MSSQL Parts search', () => {
    const text = fs.readFileSync(
      path.join(impact, '.grok', 'skills', 'a-search-impact', 'SKILL.md'),
      'utf8',
    );
    assert.match(text, /MSSQL|Parts/i);
  });

  it('stub exports run()', async () => {
    const { run } = require('../providers/local/impact/src/worker');
    assert.equal(typeof run, 'function');
    const out = await run({
      searchId: 'srch_impact',
      userId: 'U1',
      env: 'sandbox',
      source: 'impact',
      q: 'widget',
      catalogId: 1,
      category: 'General',
      subcategory: 'Parts',
    });
    assert.equal(out.ok, true);
    assert.equal(out.source, 'impact');
  });
});
