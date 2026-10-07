'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const agents = path.join(root, 'AGENTS.md');
const harvestSkill = path.join(
  root,
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

describe('FR-028 harvest-agent-skills honesty box', () => {
  it('root AGENTS.md and harvest skill exist', () => {
    assert.ok(fs.existsSync(agents), 'AGENTS.md must exist at repo root');
    assert.ok(
      fs.existsSync(harvestSkill),
      '.grok/skills/harvest-agent-skills/SKILL.md must exist',
    );
  });

  it('AGENTS.md mentions harvest and intake', () => {
    const text = fs.readFileSync(agents, 'utf8');
    assert.match(text, /CAST IRON/i);
    assert.match(text, /harvest/i);
    assert.match(text, /intake/i);
    assert.match(text, /SimonBarnett\/a-search/);
  });

  it('harvest skill github frontmatter points at a-search', () => {
    const text = fs.readFileSync(harvestSkill, 'utf8');
    assert.match(
      text,
      /github:\s*https:\/\/github\.com\/SimonBarnett\/a-search/,
    );
    assert.match(text, /honesty box/i);
    assert.match(text, /CAST IRON/i);
  });
});
