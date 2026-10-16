'use strict';

/**
 * MRB #2641: close docs/mrb when harvest parent was FAIL-superseded.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE =
  'docs/mrb for a FAIL-superseded harvest parent: close the docs tip too (cite parent FAIL-supersede + durable main playbook); do not merge a restatement tip-loop';

describe('MRB #2641 hostile close-docs-on-FAIL-superseded-parent lesson', () => {
  it('pins contiguous close-docs-on-FAIL-superseded-parent playbook', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'lesson must stay contiguous');
    assert.match(text, /docs\/mrb for a FAIL-superseded harvest parent/);
    assert.match(text, /close the docs tip too/);
    assert.match(text, /cite parent FAIL-supersede \+ durable main playbook/);
    assert.match(text, /do not merge a restatement tip-loop/);
    assert.doesNotMatch(NEEDLE, /[\u2014\u2013]/, 'ASCII only');
  });
});