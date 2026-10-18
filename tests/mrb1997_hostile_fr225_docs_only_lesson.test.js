'use strict';

/**
 * Hostile pin for the FR-225 docs-only MRB harvest lesson (fix for tip #1997).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skillPath = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

describe('MRB-1997 harvest lesson FR-225 docs-only MRB', () => {
  it('SKILL.md contiguous FR-225 docs-only pins, UTF-8 no BOM', () => {
    const buf = fs.readFileSync(skillPath);
    assert.notEqual(buf[0], 0xef, 'UTF-8 no BOM');
    const text = buf.toString('utf8');
    const line = text.split(/\n/).find((l) => l.includes('FR-225 docs-only MRB:'));
    assert.ok(line, 'lesson bullet present');
    assert.match(line, /merge origin\/main when tip behind/);
    assert.match(line, /Decision LOCKED fail-closed contact/);
    assert.match(line, /magic\/OTP/);
    assert.match(line, /no Phase 5 passwords/);
    assert.match(line, /leave FR-226\/228 implement tips open/);
    for (const b of Buffer.from(line, 'utf8')) assert.ok(b < 128, 'lesson line stays ASCII');
  });
});
