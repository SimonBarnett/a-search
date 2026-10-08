'use strict';

/** FR-060f: cj onboarding skillbook path + contract needles */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const skillRel = path.join(
  'providers',
  'live',
  'cj',
  '.grok',
  'skills',
  'a-search-cj-onboarding',
  'SKILL.md',
);

describe('FR-060f cj onboarding skillbook', () => {
  it('skill path exists with CAST IRON, GraphQL token, property ids, sandbox, selftest', () => {
    const p = path.join(root, skillRel);
    assert.ok(fs.existsSync(p), `missing ${skillRel}`);
    const text = fs.readFileSync(p, 'utf8');
    assert.match(text, /CAST IRON/i);
    assert.match(text, /CJ_API_TOKEN/);
    assert.match(text, /CJ_COMPANY_ID|CJ_WEBSITE_ID/);
    assert.match(text, /GraphQL|ads\.api\.cj\.com/i);
    assert.match(text, /\.env/);
    assert.match(text, /sandbox/i);
    assert.match(text, /selftest/i);
    assert.match(text, /intake|SimonBarnett\/a-search/i);
    assert.doesNotMatch(text, /Stub for \*\*FR-060b\*\*/);
  });

  it('AGENTS.md points at a-search-cj-onboarding', () => {
    const agents = fs.readFileSync(
      path.join(root, 'providers', 'live', 'cj', 'AGENTS.md'),
      'utf8',
    );
    assert.match(agents, /a-search-cj-onboarding/);
  });
});
