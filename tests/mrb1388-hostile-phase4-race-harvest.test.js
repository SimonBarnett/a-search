'use strict';

/**
 * MRB #1388 hostile pin: Phase-4 enable tips race keep-both / floors harvest lesson
 * contiguous in harvest-agent-skills (tip #1388).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'When two Phase-4 enable tips race, keep-both both PROVIDER_CREDENTIAL_KEYS/PLAIN_DEFAULTS and retarget FR-142/143 floors to 2*(enabled count); update sibling hostile pins that hard-code the old floor (e.g. mrb1327 14->16).';

test('mrb1388: Phase-4 race keep-both floors harvest lesson contiguous UTF-8 no BOM', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'Phase-4 race keep-both floors lesson must stay contiguous');
  assert.ok(text.includes('PROVIDER_CREDENTIAL_KEYS'));
  assert.ok(text.includes('PLAIN_DEFAULTS'));
  assert.ok(text.includes('2*(enabled count)'));
  assert.ok(text.includes('mrb1327'));
  assert.ok(text.endsWith('\n') || text.endsWith('\r\n'), 'trailing newline');
});
