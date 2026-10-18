'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
describe('MRB #2093 hostile docs/mrb supersede harvest tip lesson', () => {
  it('SKILL.md keeps docs/mrb supersede PowerShell lesson and no conflict markers', () => {
    const skill = fs.readFileSync(
      path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md'),
      'utf8',
    );
    assert.match(skill, /docs\/mrb superseding open harvest tip/);
    assert.match(skill, /git-show multiline/);
    assert.match(skill, /book collapses/);
    assert.doesNotMatch(skill, /^<<<<<<<|^=======|^>>>>>>>/m);
  });
});
