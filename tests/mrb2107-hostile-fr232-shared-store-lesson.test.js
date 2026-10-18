'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
describe('MRB #2107 hostile FR-232 shared Customers store lesson', () => {
  it('SKILL.md keeps getDefaultCustomersStore lesson and no conflict markers', () => {
    const skill = fs.readFileSync(
      path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md'),
      'utf8',
    );
    assert.match(skill, /getDefaultCustomersStore across widgetsCreate\/parts\/go/);
    assert.match(skill, /widget_not_found/);
    assert.match(skill, /FR-232/);
    assert.doesNotMatch(skill, /^<<<<<<<|^=======|^>>>>>>>/m);
  });
});
