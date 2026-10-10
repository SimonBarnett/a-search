'use strict';

/**
 * MRB #1299 hostile pin: FR-160 performance S3 deps harvest lesson
 * contiguous in harvest-agent-skills (product #1298 / tip #1299).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'When performance list* deps are unset and S3_RESULTS_BUCKET is set, wire createPerformanceS3Deps (mapping store + documented stats key); missing stats => zeros not 500 (FR-160 / #1003).';

test('mrb1299: FR-160 performance S3 deps harvest lesson contiguous UTF-8 no BOM', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'FR-160 harvest lesson must stay contiguous');
  assert.ok(text.includes('createPerformanceS3Deps'));
  assert.ok(text.includes('S3_RESULTS_BUCKET'));
  assert.ok(text.includes('zeros not 500'));
  assert.ok(text.includes('FR-160'));
  assert.ok(text.includes('#1003'));
  assert.ok(text.endsWith('\n') || text.endsWith('\r\n'), 'trailing newline');
});
