'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE =
  'CI tip MRB harvest lesson: ambient fr106/108 wix red is ACCEPTABLE for a runner-only tip (do not FAIL the runner change); confirm test-and-synth job id + whiterabbit labels; arm --auto --squash without CI poll.';

describe('mrb2526 hostile CI tip ambient fr106/108 harvest-lesson', () => {
  it('SKILL.md contiguous CI tip ambient ACCEPTABLE lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('CI tip MRB harvest lesson: ambient fr106/108'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
  });
});
