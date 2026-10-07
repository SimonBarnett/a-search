'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
describe('hostile MRB #248 FR-060c', () => {
  it('amazon onboarding skill has Associates/PA-API and AGENTS pointer', () => {
    const skill = fs.readFileSync(
      path.join(root, 'providers/live/amazon/.grok/skills/a-search-amazon-onboarding/SKILL.md'),
      'utf8',
    );
    assert.match(skill, /CAST IRON/i);
    assert.match(skill, /AMAZON_ACCESS_KEY/);
    assert.match(skill, /Associates|PA-API/);
    assert.match(skill, /sandbox/i);
    assert.match(skill, /selftest/i);
    const agents = fs.readFileSync(path.join(root, 'providers/live/amazon/AGENTS.md'), 'utf8');
    assert.match(agents, /a-search-amazon-onboarding/);
  });
});
