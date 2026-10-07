'use strict';

/** FR-051d: impact onboarding skillbook CAST IRON + drain playbook needles */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const onboarding = path.join(
  root,
  'providers',
  'local',
  'impact',
  'onboarding',
);
const skillPath = path.join(
  onboarding,
  '.grok',
  'skills',
  'a-search-impact-onboarding',
  'SKILL.md',
);
const agentsPath = path.join(onboarding, 'AGENTS.md');

describe('FR-051d impact onboarding skillbook CAST IRON', () => {
  it('SKILL.md and AGENTS.md exist', () => {
    assert.ok(fs.existsSync(skillPath), 'missing SKILL.md');
    assert.ok(fs.existsSync(agentsPath), 'missing AGENTS.md');
  });

  it('SKILL has CAST IRON harvest to SimonBarnett/a-search', () => {
    const text = fs.readFileSync(skillPath, 'utf8');
    assert.match(text, /CAST IRON/i);
    assert.match(text, /SimonBarnett\/a-search/);
    assert.match(text, /intake/i);
  });

  it('SKILL documents drain playbook until remaining=0', () => {
    const text = fs.readFileSync(skillPath, 'utf8');
    assert.match(text, /drain/i);
    assert.match(text, /remaining\s*(===|=)\s*0|remaining=0|remaining === 0/i);
    assert.match(text, /runOnce/i);
    assert.match(text, /pending/i);
  });

  it('AGENTS has CAST IRON harvest + remaining=0 drain needles', () => {
    const text = fs.readFileSync(agentsPath, 'utf8');
    assert.match(text, /CAST IRON/i);
    assert.match(text, /SimonBarnett\/a-search/);
    assert.match(text, /remaining\s*(===|=)\s*0|remaining=0|remaining === 0/i);
    assert.match(text, /drain/i);
  });
});
