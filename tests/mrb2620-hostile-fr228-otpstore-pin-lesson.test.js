'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE = 'MRB a-search FR-228: pin otpStore Decision LOCKED rate limits + migration 016 never madeiradb/SystemOTPs + shops 403 contact_unverified + JWT join-parts on docs/mrb-N; run tests with D:\\Tools\\node\\node.exe (PATH node may be too old for --test)';
describe('MRB #2620 hostile FR-228 otpStore pin harvest lesson', () => {
  it('SKILL.md contiguous FR-228 lesson (UTF-8 no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    assert.ok(raw.toString('utf8').includes(NEEDLE), 'missing contiguous lesson needle');
    assert.doesNotMatch(raw.toString('utf8'), /^<<<<<<<|^=======|^>>>>>>>/m);
  });
});
