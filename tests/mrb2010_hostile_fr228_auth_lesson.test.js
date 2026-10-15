'use strict';

/**
 * docs/mrb-2010 hostile pin for harvest tip #2010 (FR-228 auth lesson).
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

describe('MRB-2010 harvest lesson FR-228 auth', () => {
  it('SKILL.md contiguous FR-228 contactVerified + Closes ASCII pins', () => {
    const buf = fs.readFileSync(skillPath);
    assert.notEqual(buf[0], 0xef, 'UTF-8 no BOM');
    const text = buf.toString('utf8');
    assert.match(text, /FR-228 auth/);
    assert.match(text, /contactVerified session after OTP/);
    assert.match(text, /403 contact_unverified/);
    assert.match(text, /ASCII\/no-BOM/);
    assert.match(text, /Closes parsing/);
    assert.doesNotMatch(text, /^<<<<<<<|^=======|^>>>>>>>/m);
  });
});
