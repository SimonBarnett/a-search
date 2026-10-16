'use strict';

/**
 * docs/mrb-3015 hostile pin: CLOSED-parent re-offer duplicate tips.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skillPath = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

describe('MRB-3015 CLOSED-parent re-offer duplicate tip', () => {
  it('pins the contiguous FAIL-supersede playbook', () => {
    const buf = fs.readFileSync(skillPath);
    assert.notEqual(buf[0], 0xef, 'UTF-8 no BOM');
    const text = buf.toString('utf8');
    const needle = 'docs/mrb CLOSED-parent re-offer Duplicate tips that only cite an open primary tip: FAIL-supersede citing that tip + bobiverse-bob-job-mrb FR #3414; do not merge the meta-receipt';
    assert.ok(text.includes(needle), 'contiguous CLOSED-parent re-offer bullet missing');
    assert.doesNotMatch(text, /^<<<<<<<|^=======|^>>>>>>>/m);
  });
});
