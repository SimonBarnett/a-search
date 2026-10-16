'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE = 'a-search MRB: stack docs/mrb-N hostile pins on the product tip; close CONFLICTING docs branches that replayed the product tree; arm auto-merge on product+docs without waiting (FR #3948).';
describe('MRB #2608 hostile stack docs/mrb on product tip lesson', () => {
  it('SKILL.md contiguous stack-docs lesson (UTF-8 no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    assert.ok(raw.toString('utf8').includes(NEEDLE), 'missing contiguous lesson needle');
    assert.doesNotMatch(raw.toString('utf8'), /^<<<<<<<|^=======|^>>>>>>>/m);
  });
});
