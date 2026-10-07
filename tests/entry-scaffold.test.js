'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const entry = path.join(root, 'entry');

const REQUIRED = [
  'AGENTS.md',
  path.join('.grok', 'skills', 'a-search-entry', 'SKILL.md'),
  '.env.example',
  path.join('src', 'index.js'),
];

describe('FR-003 entry scaffold', () => {
  it('required entry paths exist', () => {
    for (const rel of REQUIRED) {
      const p = path.join(entry, rel);
      assert.ok(fs.existsSync(p), `missing ${path.join('entry', rel)}`);
    }
  });

  it('a-search-entry skill mentions POST /search and JWT userId', () => {
    const skillPath = path.join(entry, '.grok', 'skills', 'a-search-entry', 'SKILL.md');
    const text = fs.readFileSync(skillPath, 'utf8');
    assert.match(text, /POST\s+\/search/i);
    assert.match(text, /userId/);
    assert.match(text, /JWT/i);
    assert.match(text, /fan-?out/i);
    // Skill may say "no provider secrets"; reject actual secret key shapes only.
    assert.doesNotMatch(text, /AWS_SECRET_ACCESS_KEY|SQS_[A-Z]+_KEY\s*=/i);
  });

  it('.env.example has JWT_*, A_SEARCH_ENV, and SQS URL docs (no provider API secrets)', () => {
    const envPath = path.join(entry, '.env.example');
    const text = fs.readFileSync(envPath, 'utf8');
    assert.match(text, /JWT_/);
    assert.match(text, /A_SEARCH_ENV/);
    assert.match(text, /SQS_.*_LIVE_URL|SQS_<SOURCE>_LIVE_URL/i);
    // Queue URL docs OK; do not name provider API secret keys.
    assert.doesNotMatch(text, /AWS_SECRET_ACCESS_KEY|PAAPI|EBAY_CLIENT_SECRET|PROVIDER_API/i);
  });
});
