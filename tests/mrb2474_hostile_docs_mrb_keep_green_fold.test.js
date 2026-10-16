'use strict';

/**
 * MRB #2474 hostile pin: fold docs/mrb hostile onto product tip when keep-green
 * already needed; close empty/stacked docs/mrb (squash race).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'MRB docs/mrb-N hostile: when product tip already needs a CI keep-green commit, fold the additive hostile onto the same tip and close an empty/stacked docs/mrb PR --- squash merge-on-green races a tip-based docs PR that still contains the product commits.';

test('mrb2474: docs/mrb keep-green fold lesson contiguous', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md UTF-8 no BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'keep-green fold lesson must stay contiguous');
  assert.ok(text.includes('CI keep-green commit'));
  assert.ok(text.includes('fold the additive hostile onto the same tip'));
  assert.ok(text.includes('close an empty/stacked docs/mrb PR'));
  assert.ok(text.includes('squash merge-on-green races'));
});