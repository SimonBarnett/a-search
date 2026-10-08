'use strict';

/** FR-060e: rakuten onboarding skillbook path + contract needles */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const skillRel = path.join(
  'providers',
  'live',
  'rakuten',
  '.grok',
  'skills',
  'a-search-rakuten-onboarding',
  'SKILL.md',
);

describe('FR-060e rakuten onboarding skillbook', () => {
  it('skill path exists with CAST IRON, affiliate .env, rate limits, sandbox, selftest', () => {
    const p = path.join(root, skillRel);
    assert.ok(fs.existsSync(p), `missing ${skillRel}`);
    const text = fs.readFileSync(p, 'utf8');
    assert.match(text, /CAST IRON/i);
    assert.match(text, /RAKUTEN_APPLICATION_KEY/);
    assert.match(text, /RAKUTEN_AFFILIATE_ID|RAKUTEN_SITE_ID/);
    assert.match(text, /rate limit/i);
    assert.match(text, /\.env/);
    assert.match(text, /sandbox/i);
    assert.match(text, /selftest/i);
    assert.match(text, /intake|SimonBarnett\/a-search/i);
    assert.doesNotMatch(text, /Stub for \*\*FR-060b\*\*/);
  });

  it('AGENTS.md points at a-search-rakuten-onboarding', () => {
    const agents = fs.readFileSync(
      path.join(root, 'providers', 'live', 'rakuten', 'AGENTS.md'),
      'utf8',
    );
    assert.match(agents, /a-search-rakuten-onboarding/);
  });
});
