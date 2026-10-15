'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE = "FR-228 auth: mint contactVerified session after OTP; gate merchant shops connect with 403 contact_unverified; PR body must be ASCII/no-BOM or GitHub skips Closes parsing.";
describe('mrb2010 hostile FR-228 auth lesson', () => {
  it('harvest-agent-skills carries contiguous FR-228 auth lesson (ASCII)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false, 'no BOM');
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous FR-228 auth lesson');
    const line = text.split(/\r?\n/).find((l) => l.includes('FR-228 auth: mint contactVerified'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
    assert.equal(line.includes('\u2013'), false);
  });
});