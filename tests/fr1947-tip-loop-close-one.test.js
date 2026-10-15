'use strict';

/**
 * FR-1947 / FR-2314 / FR-2315: tip-loop close one PR at a time; strict ExistingPrUrl twin filter.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const skillPath = path.join(root, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

describe('FR-1947 tip-loop close one-at-a-time', () => {
  it('harvest-agent-skills SKILL.md tip-loop close CAST IRON (UTF-8 no BOM)', () => {
    const buf = fs.readFileSync(skillPath);
    assert.notEqual(buf[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
    const text = buf.toString('utf8');
    const line = text.split(/\r?\n/).find(
      (l) => l.startsWith('- ') && l.includes('tip-loop close') && l.includes('ExistingPrUrl'),
    );
    assert.ok(line, 'tip-loop ExistingPrUrl close bullet present');
    assert.ok(line.includes('never pipe a multi-number Where-Object list into one'));
    assert.ok(line.includes('too many arguments'));
    assert.ok(line.includes('exact title StartsWith'));
    assert.ok(line.includes('never a bare pull/N substring'));
    assert.ok(line.includes('Existing PR:'));
    assert.ok(line.includes('FR-1947'));
    assert.ok(line.includes('FR-2314'));
    assert.ok(line.includes('FR-2315'));
    assert.ok(line.includes('gh pr close'));
  });
});