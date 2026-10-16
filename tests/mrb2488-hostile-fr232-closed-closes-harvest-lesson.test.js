'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE =
  'Product MRB FR-232: when Closes issue is already CLOSED, still PASS if tip lands Decision LOCKED + acceptance tests; tip-fix fr106/108 wix stay-dark; fold hostile onto tip; arm --auto --squash without CI poll.';

describe('mrb2488 hostile FR-232 closed-Closes harvest-lesson tip', () => {
  it('SKILL.md contiguous FR-232 closed-Closes lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('Product MRB FR-232: when Closes issue is already CLOSED'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
  });
});
