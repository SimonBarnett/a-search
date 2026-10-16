'use strict';

/**
 * MRB #2628: migrations FR-251 target-header gate before PASS.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE =
  'MRB a-search migrations: before PASS run mrb2209/FR-251 target-header gate on every new *.sql; missing -- target: a_search is one fix PR then arm auto-merge on product+fix';

describe('MRB #2628 hostile migrations target-header gate lesson', () => {
  it('pins contiguous FR-251 target-header gate playbook', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'lesson must stay contiguous');
    assert.match(text, /MRB a-search migrations: before PASS run mrb2209\/FR-251 target-header gate/);
    assert.match(text, /missing -- target: a_search is one fix PR/);
    assert.match(text, /arm auto-merge on product\+fix/);
    assert.doesNotMatch(NEEDLE, /[\u2014\u2013]/, 'ASCII only');
  });
});