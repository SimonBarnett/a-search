'use strict';

/**
 * docs/mrb-1997 hostile pin for harvest tip #1997 (FR-225 docs-only MRB lesson).
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

describe('MRB-1997 harvest lesson FR-225 docs-only MRB', () => {
  it('SKILL.md contiguous FR-225 docs-only pins', () => {
    const buf = fs.readFileSync(skillPath);
    assert.notEqual(buf[0], 0xef, 'UTF-8 no BOM');
    const text = buf.toString('utf8');
    assert.match(text, /FR-225 docs-only MRB/);
    assert.match(text, /merge origin\/main when tip behind/);
    assert.match(text, /Decision LOCKED fail-closed contact/);
    assert.match(text, /magic\/OTP/);
    assert.match(text, /no Phase 5 passwords/);
    assert.match(text, /leave FR-226\/228 implement tips open/);
    assert.doesNotMatch(text, /^<<<<<<<|^=======|^>>>>>>>/m);
  });
});
