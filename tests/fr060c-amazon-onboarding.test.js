'use strict';

/** FR-060c: amazon onboarding skillbook path + contract needles */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const skillRel = path.join(
  'providers',
  'live',
  'amazon',
  '.grok',
  'skills',
  'a-search-amazon-onboarding',
  'SKILL.md',
);

describe('FR-060c amazon onboarding skillbook', () => {
  it('skill path exists with CAST IRON, .env, sandbox, selftest needles', () => {
    const p = path.join(root, skillRel);
    assert.ok(fs.existsSync(p), `missing ${skillRel}`);
    const text = fs.readFileSync(p, 'utf8');
    assert.match(text, /CAST IRON/i);
    assert.match(text, /AMAZON_ACCESS_KEY/);
    assert.match(text, /AMAZON_SECRET_KEY/);
    assert.match(text, /AMAZON_PARTNER_TAG/);
    assert.match(text, /\.env/);
    assert.match(text, /sandbox/i);
    assert.match(text, /selftest/i);
    assert.match(text, /intake|SimonBarnett\/a-search/i);
  });

  it('AGENTS.md points at a-search-amazon-onboarding', () => {
    const agents = fs.readFileSync(
      path.join(root, 'providers', 'live', 'amazon', 'AGENTS.md'),
      'utf8',
    );
    assert.match(agents, /a-search-amazon-onboarding/);
  });
});
