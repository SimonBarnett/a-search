'use strict';

/** FR-060d: ebay onboarding skillbook path + contract needles */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const skillRel = path.join(
  'providers',
  'live',
  'ebay',
  '.grok',
  'skills',
  'a-search-ebay-onboarding',
  'SKILL.md',
);

describe('FR-060d ebay onboarding skillbook', () => {
  it('skill path exists with CAST IRON, OAuth .env, sandbox, selftest needles', () => {
    const p = path.join(root, skillRel);
    assert.ok(fs.existsSync(p), `missing ${skillRel}`);
    const text = fs.readFileSync(p, 'utf8');
    assert.match(text, /CAST IRON/i);
    assert.match(text, /EBAY_CLIENT_ID/);
    assert.match(text, /EBAY_CLIENT_SECRET/);
    assert.match(text, /EBAY_REFRESH_TOKEN/);
    assert.match(text, /Browse/i);
    assert.match(text, /\.env/);
    assert.match(text, /sandbox/i);
    assert.match(text, /selftest/i);
    assert.match(text, /intake|SimonBarnett\/a-search/i);
  });

  it('AGENTS.md points at a-search-ebay-onboarding', () => {
    const agents = fs.readFileSync(
      path.join(root, 'providers', 'live', 'ebay', 'AGENTS.md'),
      'utf8',
    );
    assert.match(agents, /a-search-ebay-onboarding/);
  });
});