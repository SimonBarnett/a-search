'use strict';

/**
 * MRB #4144 hostile pin: re-offered FAIL-supersede twin harvest lesson contiguous.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'Re-offered harvest-lesson MRB already FAIL-supersede closed as twin of a merged tip: ACK, re-verify CLOSED+board, DONE PASS with assigned URL; do not reopen or open a worktree';

test('mrb4144: harvest re-offer FAIL-supersede twin lesson contiguous UTF-8 no BOM', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md UTF-8 no BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 're-offer FAIL-supersede twin lesson must stay contiguous');
  assert.ok(text.includes('do not reopen or open a worktree'));
});
