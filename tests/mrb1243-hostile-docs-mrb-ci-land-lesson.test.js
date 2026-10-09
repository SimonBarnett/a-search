'use strict';

/**
 * MRB #1243 hostile pin: docs/mrb-after-product-CI-land harvest lesson contiguous.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const MRB_DOC = path.join(ROOT, 'docs', 'mrb', 'mrb-1243.md');

const NEEDLE =
  'MRB docs/mrb after product CI land: verify Actions run green claim, merge origin/main into behind docs tip before gh pr merge, pin ci.yml Node20+setup-python+npm ci/test/synth+180m; self-MRB clear when seat marker differs (marchhare-42664 vs 960).';

test('mrb1243: docs/mrb after product CI land lesson contiguous', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md UTF-8 no BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'docs/mrb CI-land harvest lesson must stay contiguous');
  assert.ok(text.includes('merge origin/main into behind docs tip'));
  assert.ok(text.includes('pin ci.yml Node20+setup-python'));
  assert.ok(text.includes('self-MRB clear when seat marker differs'));
});

test('mrb1243: docs/mrb/mrb-1243.md cites covering PRs', () => {
  const raw = fs.readFileSync(MRB_DOC);
  assert.notEqual(raw[0], 0xef, 'mrb-1243.md UTF-8 no BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes('#1243'));
  assert.ok(text.includes('harvest-agent-skills'));
  assert.ok(text.includes(NEEDLE.split(';')[0]));
});