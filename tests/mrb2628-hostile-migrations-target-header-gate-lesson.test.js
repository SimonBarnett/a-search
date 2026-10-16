'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE = 'MRB a-search migrations: before PASS run mrb2209/FR-251 target-header gate on every new *.sql; missing -- target: a_search is one fix PR then arm auto-merge on product+fix';
describe('MRB #2628 hostile migrations target-header gate lesson', () => {
  it('SKILL.md contiguous migrations gate lesson (UTF-8 no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    assert.ok(raw.toString('utf8').includes(NEEDLE), 'missing contiguous lesson needle');
    assert.doesNotMatch(raw.toString('utf8'), /^<<<<<<<|^=======|^>>>>>>>/m);
  });
});
