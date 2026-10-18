'use strict';

/**
 * MRB #1449 hostile pin: Madeira merchant enable retargets FR-607/mrb608 dark stubs.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'When Phase-4 enables a Madeira merchant stub (wix/shopify/woocommerce), update FR-607/mrb608 so only remaining dark stubs assert enabled=false; keep class=merchant merchantConnect pins for the enabled id';

test('mrb1449: Madeira merchant FR-607/mrb608 harvest lesson contiguous UTF-8 no BOM', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'Madeira merchant FR-607/mrb608 lesson must stay contiguous');
  assert.ok(text.includes('FR-607/mrb608'));
  assert.ok(text.includes('remaining dark stubs'));
  assert.ok(text.includes('class=merchant'));
  assert.ok(text.includes('merchantConnect'));
  assert.ok(text.endsWith('\n') || text.endsWith('\r\n'));
});
