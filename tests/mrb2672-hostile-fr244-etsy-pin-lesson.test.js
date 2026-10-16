'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE = 'FR-244 Etsy MRB: pin x-api-key keystring:shared_secret fail-closed + Rakuten u1 deeplink; treat local FR-170 CDK synth jose/junction failure as ACCEPTABLE when source credential pins pass';
describe('MRB #2672 hostile FR-244 Etsy pin harvest lesson', () => {
  it('SKILL.md contiguous FR-244 lesson (UTF-8 no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    assert.ok(raw.toString('utf8').includes(NEEDLE), 'missing contiguous lesson needle');
    assert.doesNotMatch(raw.toString('utf8'), /^<<<<<<<|^=======|^>>>>>>>/m);
  });
});
