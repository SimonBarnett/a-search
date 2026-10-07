'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rakuten = path.join(__dirname, '..', 'providers', 'live', 'rakuten');

describe('MRB #58 hostile: FR-018 rakuten scaffold', () => {
  it('paths exist; run(msg) callable; skill notes XML + rate limits', async () => {
    assert.ok(fs.existsSync(path.join(rakuten, 'AGENTS.md')));
    const skill = fs.readFileSync(
      path.join(rakuten, '.grok', 'skills', 'a-search-rakuten', 'SKILL.md'),
      'utf8'
    );
    assert.match(skill, /XML/i);
    assert.match(skill, /429|Retry-After|rate.?limit/i);
    const { run } = require('../providers/live/rakuten/src/worker');
    const out = await run({
      searchId: 'srch_h',
      userId: 'U1',
      env: 'sandbox',
      source: 'rakuten',
      q: 'x',
      catalogId: 1,
      category: 'c',
      subcategory: 's',
    });
    assert.equal(out.ok, true);
    assert.equal(out.source, 'rakuten');
  });

  it('.env.example keeps Rakuten secrets in provider env only', () => {
    const text = fs.readFileSync(path.join(rakuten, '.env.example'), 'utf8');
    assert.match(text, /RAKUTEN_/i);
    const entryEnv = fs.readFileSync(
      path.join(__dirname, '..', 'entry', '.env.example'),
      'utf8'
    );
    assert.doesNotMatch(entryEnv, /RAKUTEN_/);
  });
});
