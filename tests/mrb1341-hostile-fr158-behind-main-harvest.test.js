'use strict';

/**
 * MRB #1341 hostile pin: FR-158 behind-main stack-conflict harvest lesson contiguous.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'a-search behind-main FR-158 stack conflict: keep resolveStageSuffix+costTags then FR-149/FR-158 no-VPC egress comment; release-gap Yes for 153-157 + FR-158';

test('mrb1341: FR-158 behind-main fold harvest lesson contiguous UTF-8 no BOM', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'FR-158 behind-main harvest lesson must stay contiguous');
  assert.ok(text.includes('resolveStageSuffix'));
  assert.ok(text.includes('costTags'));
  assert.ok(text.includes('no-VPC egress'));
  assert.ok(text.includes('FR-158'));
  assert.ok(text.includes('release-gap Yes'));
  assert.ok(text.endsWith('\n') || text.endsWith('\r\n'), 'trailing newline');
});
