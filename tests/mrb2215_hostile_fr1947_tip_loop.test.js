'use strict';

/**
 * MRB #2215 hostile pins for FR-1947 tip-loop close-one playbook (extended FR-2314/2315).
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
    const line = text.split(/\r?\n/).find(
      (l) => l.startsWith('- ') && l.includes('tip-loop close') && l.includes('ExistingPrUrl'),
    );
    assert.ok(line, 'tip-loop bullet');
    assert.ok(line.includes('ExistingPrUrl'));
    assert.ok(line.includes('gh pr close'));
    assert.ok(line.includes('never pipe a multi-number Where-Object list'));
    assert.ok(line.includes('too many arguments'));
    assert.ok(line.includes('exact title StartsWith'));
    assert.ok(line.includes('FR-1947'));
  });

  it('fr1947 gate pins tip-loop CAST IRON and no-BOM', () => {
    const text = fs.readFileSync(GATE, 'utf8');
    assert.ok(text.includes('0xef'));
    assert.ok(text.includes('harvest-agent-skills'));
    assert.ok(text.includes('FR-1947'));
    assert.ok(text.includes('never a bare pull/N substring') || text.includes('FR-2314'));
  });
});