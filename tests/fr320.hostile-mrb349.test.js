'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
describe('hostile MRB #349 harvest-agent-skills consolidate', () => {
  it('skill has Plan gap analysis and what-does-not-belong table', () => {
    const t = fs.readFileSync(path.join(root, '.grok/skills/harvest-agent-skills/SKILL.md'), 'utf8');
    assert.match(t, /Plan gap analysis/i);
    assert.match(t, /What does \*\*not\*\* belong|What does \*\*not\*\* belong in this book/i);
    assert.match(t, /bobiverse-bob-job-mrb/);
    assert.match(t, /schedule\.handler/);
  });
});
