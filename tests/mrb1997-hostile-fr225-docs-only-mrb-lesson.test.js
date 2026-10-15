'use strict';
/**
 * docs/mrb-1997 hostile pin: FR-225 docs-only MRB lesson stays contiguous in harvest-agent-skills.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE =
  'FR-225 docs-only MRB: merge origin/main when tip behind; pin Decision LOCKED fail-closed contact + magic/OTP + no Phase 5 passwords; leave FR-226/228 implement tips open';

describe('mrb1997 hostile FR-225 docs-only MRB lesson', () => {
  it('harvest-agent-skills carries contiguous FR-225 docs-only MRB lesson (ASCII)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false, 'SKILL.md must be UTF-8 no BOM');
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous FR-225 docs-only MRB lesson');
    const line = text.split(/\r?\n/).find((l) => l.includes('FR-225 docs-only MRB:'));
    assert.ok(line, 'lesson line not found');
    assert.equal(line.includes('\u2014'), false, 'lesson line must not use em-dash');
    assert.equal(line.includes('\u2013'), false, 'lesson line must not use en-dash');
  });
});
