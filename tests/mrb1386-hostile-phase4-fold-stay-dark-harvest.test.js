'use strict';

/**
 * MRB #1386 hostile pin: Phase-4 enable after-fold stay-dark checklist harvest lesson
 * contiguous in harvest-agent-skills (tip #1386).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'Phase-4 enable FR: after fold, retarget FR-142/143 floors +2 env-pairs and drop the id from every stay-dark pin (fr166 PHASE2_STUB_IDS, mrb1042, registry DEFAULT_ON, mrb31 default-on, provider-onboarding LIVE_STUB) before CI; run-tests.js breaks on first alphabetical batch';

test('mrb1386: Phase-4 after-fold stay-dark checklist harvest lesson contiguous UTF-8 no BOM', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'Phase-4 after-fold stay-dark checklist lesson must stay contiguous');
  assert.ok(text.includes('PHASE2_STUB_IDS'));
  assert.ok(text.includes('mrb1042'));
  assert.ok(text.includes('LIVE_STUB'));
  assert.ok(text.includes('run-tests.js breaks on first alphabetical batch'));
  assert.ok(text.endsWith('\n') || text.endsWith('\r\n'), 'trailing newline');
});
