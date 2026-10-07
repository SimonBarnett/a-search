'use strict';

/** Consolidation: harvest-agent-skills Plan gap analysis playbook */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skill = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

describe('harvest-agent-skills Plan gap analysis', () => {
  it('pins ff-pull, many small FRs, schedule.handler first wire', () => {
    const text = fs.readFileSync(skill, 'utf8');
    assert.match(text, /Plan gap analysis/i);
    assert.match(text, /origin\/main/);
    assert.match(text, /many small/i);
    assert.match(text, /Goal/);
    assert.match(text, /Deliverables/);
    assert.match(text, /Testable/);
    assert.match(text, /schedule\.handler/);
    assert.match(text, /roll/);
    assert.match(text, /umbrella/i);
    assert.match(text, /github:\s*https:\/\/github\.com\/SimonBarnett\/a-search/);
  });
});
