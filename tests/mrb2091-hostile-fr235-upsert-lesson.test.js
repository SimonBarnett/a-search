'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
describe('MRB #2091 hostile FR-235 upsertConnect lesson', () => {
  it('SKILL.md keeps upsertConnect uniqueness lesson and no conflict markers', () => {
    const skill = fs.readFileSync(
      path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md'),
      'utf8',
    );
    assert.match(skill, /FR-235 upsertConnect/);
    assert.match(skill, /shop_already_connected/);
    assert.match(skill, /fixture provider/);
    assert.doesNotMatch(skill, /^<<<<<<<|^=======|^>>>>>>>/m);
  });
});
