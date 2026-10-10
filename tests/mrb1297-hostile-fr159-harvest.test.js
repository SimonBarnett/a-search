'use strict';

/**
 * MRB #1297 hostile pin: FR-159 shared/package.json files[] harvest lesson
 * contiguous in harvest-agent-skills (product #1296 / tip #1297).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'When shared/ gains a runtime dir, list it in shared/package.json files[] and pin all runtime dirs so pack cannot drop modules (FR-159 / #1002).';

test('mrb1297: FR-159 shared files[] harvest lesson contiguous UTF-8 no BOM', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'FR-159 harvest lesson must stay contiguous');
  assert.ok(text.includes('shared/package.json files[]'));
  assert.ok(text.includes('pin all runtime dirs'));
  assert.ok(text.includes('FR-159'));
  assert.ok(text.includes('#1002'));
  assert.ok(text.endsWith('\n') || text.endsWith('\r\n'), 'trailing newline');
});
