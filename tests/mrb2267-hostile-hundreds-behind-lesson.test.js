'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('docs/mrb-2267 hostile hundreds-behind tip lesson', () => {
  it('SKILL.md pins abort keep-both rebuild + FR #3948 never --admin', () => {
    const skill = fs.readFileSync(
      path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md'),
      'utf8',
    );
    assert.match(skill, /hundreds behind/);
    assert.match(skill, /abort keep-both/);
    assert.match(skill, /rebuild on current main/);
    assert.match(skill, /FR #3948/);
    assert.match(skill, /never --admin/);
    assert.equal(skill.charCodeAt(0) === 0xfeff, false);
  });
});
