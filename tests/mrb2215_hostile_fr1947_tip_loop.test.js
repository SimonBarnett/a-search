'use strict';

/**
 * MRB #2215 hostile pins for FR-1947 tip-loop close-one playbook.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(
  ROOT,
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);
const GATE = path.join(ROOT, 'tests', 'fr1947-tip-loop-close-one.test.js');

describe('MRB #2215 hostile FR-1947 tip-loop close', () => {
  it('skill forbids batch gh pr close; requires one-at-a-time + ExistingPrUrl filter', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef);
    const text = buf.toString('utf8');
    assert.match(text, /ExistingPrUrl/);
    assert.match(text, /gh pr close <N>|gh pr close \$\{?N\}?|one `gh pr close/);
    assert.match(text, /never pipe a multi-number Where-Object list/);
    assert.match(text, /too many arguments/);
    assert.match(text, /exact title StartsWith/);
    assert.match(text, /FR-1947/);
  });

  it('fr1947 gate pins contiguous NEEDLE and no-BOM', () => {
    const text = fs.readFileSync(GATE, 'utf8');
    assert.match(text, /const NEEDLE/);
    assert.match(text, /0xef/);
    assert.match(text, /harvest-agent-skills/);
    assert.match(text, /FR-1947/);
  });
});
