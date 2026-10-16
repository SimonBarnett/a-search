'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE = 'a-search harvest twin: keep the fuller CLOSED-superseded docs/mrb tip (lesson+hostile pin); close skill-only re-offers citing that PR; strip UTF-8 BOM from new hostile *.test.js before merge.';
describe('MRB #2610 hostile fuller CLOSED-superseded docs/mrb twin lesson', () => {
  it('SKILL.md contiguous twin+BOM lesson (UTF-8 no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    assert.ok(raw.toString('utf8').includes(NEEDLE), 'missing contiguous lesson needle');
    assert.doesNotMatch(raw.toString('utf8'), /^<<<<<<<|^=======|^>>>>>>>/m);
  });
});
