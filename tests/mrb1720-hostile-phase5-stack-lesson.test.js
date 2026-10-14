'use strict';

/**
 * MRB #1755 land: Stacked Phase5 ComponentsPiece tip harvest lesson
 * contiguous ASCII (clean tip; corrupted docs/mrb-1720 closed).
 */

const test = require('node:test');
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

const NEEDLE =
  'Stacked Phase5 ComponentsPiece tips: retarget tip to main, merge origin/main, Closes full open FR stack, close earlier stack heads as superseded, board PASS + --auto --squash, DONE without CI poll';

test('mrb1755: Stacked Phase5 tip lesson contiguous ASCII in harvest-agent-skills', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'Stacked Phase5 harvest lesson must stay contiguous');
  assert.ok(text.includes('retarget tip to main'), 'must cite retarget tip to main');
  assert.ok(text.includes('--auto --squash'), 'must cite auto squash');
  assert.doesNotMatch(
    NEEDLE,
    /[\u2014\u2013\u00e2]/,
    'lesson needle must be ASCII (no em/en-dash)',
  );
});