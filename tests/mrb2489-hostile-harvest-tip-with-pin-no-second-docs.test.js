'use strict';

/**
 * MRB #2489: harvest tip that already carries its hostile pin needs no second docs/mrb.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE =
  'Harvest-lesson tip that already carries its hostile pin: light triage PASS when absent on main, tip-fix fr106/108 wix stay-dark only, arm --auto --squash, DONE without a second docs/mrb.';

describe('MRB #2489 hostile harvest tip with on-tip pin (no second docs/mrb)', () => {
  it('pins contiguous on-tip-hostile-no-second-docs/mrb playbook', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'lesson must stay contiguous');
    assert.match(text, /Harvest-lesson tip that already carries its hostile pin/);
    assert.match(text, /light triage PASS when absent on main/);
    assert.match(text, /tip-fix fr106\/108 wix stay-dark only/);
    assert.match(text, /arm --auto --squash/);
    assert.match(text, /DONE without a second docs\/mrb/);
    assert.doesNotMatch(NEEDLE, /[\u2014\u2013]/, 'ASCII only');
    assert.match(text, /docs\/mrb stacked on an open harvest-lesson tip/);
  });
});