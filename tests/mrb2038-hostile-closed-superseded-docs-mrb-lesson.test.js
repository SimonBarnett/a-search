'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
describe('MRB #2038 hostile closed-superseded docs/mrb lesson', () => {
  it('SKILL.md keeps CLOSED superseded by docs/mrb stack lesson contiguous', () => {
    const skill = fs.readFileSync(
      path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md'),
      'utf8',
    );
    assert.match(
      skill,
      /When harvest tip is CLOSED superseded by docs\/mrb stack that carries the lesson bullet \+ hostile pin/,
    );
    assert.match(skill, /do not reopen the closed parent tip/);
    assert.doesNotMatch(skill, /^<<<<<<<|^=======|^>>>>>>>/m);
  });
});
