'use strict';

/** Hostile pins for MRB a-search#82 / FR-028 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('MRB #82 hostile: FR-028 harvest wiring', () => {
  it('docs/mrb-82.md pins honesty-box gates', () => {
    const text = fs.readFileSync(path.join(root, 'docs', 'mrb-82.md'), 'utf8');
    assert.match(text, /AGENTS\.md/);
    assert.match(text, /harvest-agent-skills/);
    assert.match(text, /SimonBarnett\/a-search/);
    assert.match(text, /github:/);
  });

  it('harvest skill github home is a-search', () => {
    const text = fs.readFileSync(
      path.join(root, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md'),
      'utf8',
    );
    assert.match(
      text,
      /github:\s*https:\/\/github\.com\/SimonBarnett\/a-search/,
    );
    assert.match(text, /wrong book|FAIL-supersede/i);
  });

  it('AGENTS CAST IRON names a-search intake repo', () => {
    const text = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    assert.match(text, /CAST IRON/i);
    assert.match(text, /-Repo SimonBarnett\/a-search/);
  });
});
