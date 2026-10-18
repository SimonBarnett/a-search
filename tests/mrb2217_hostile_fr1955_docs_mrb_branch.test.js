'use strict';

/**
 * MRB #2217 hostile pins for FR-1955 docs/mrb unique -mh{seat} branch playbook.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(
  ROOT,
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);
const GATE = path.join(ROOT, 'tests', 'fr1955-docs-mrb-unique-branch.test.js');

describe('MRB #2217 hostile FR-1955 docs/mrb unique branch', () => {
  it('skill has unique -mh{seat} playbook; no conflict markers; FR-1947 tip-loop also present', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef);
    const text = buf.toString('utf8');
    assert.doesNotMatch(text, /^<<<<<<<|^=======|^>>>>>>>/m);
    assert.match(text, /-mh\{seat\}/);
    assert.match(text, /Clear-BobiverseJobWorktrees/);
    assert.match(text, /never force-remove another seat/);
    assert.match(text, /FR-1955/);
    assert.match(text, /FR-1947/);
    assert.match(text, /ExistingPrUrl/);
  });

  it('fr1955 gate pins contiguous NEEDLE and no-BOM', () => {
    const text = fs.readFileSync(GATE, 'utf8');
    assert.match(text, /const NEEDLE/);
    assert.match(text, /0xef/);
    assert.match(text, /docs\/mrb-N-hostile-mh\{seat\}/);
  });
});
