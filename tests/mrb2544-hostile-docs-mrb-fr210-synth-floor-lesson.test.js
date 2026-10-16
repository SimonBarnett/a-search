'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE =
  'docs/mrb FR-210: when tip CONFLICTING, merge origin/main keep-both; tip-fix ambient fr142/fr143 floors from CI evidence if in-process aws-cdk-lib synth hangs on the seat; parent product Closes already landed so Refs not second Closes';
describe('MRB #2544 hostile docs/mrb FR-210 synth-floor harvest lesson', () => {
  it('SKILL.md contiguous FR-210 lesson (UTF-8 no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    assert.doesNotMatch(text, /^<<<<<<<|^=======|^>>>>>>>/m);
  });
});
