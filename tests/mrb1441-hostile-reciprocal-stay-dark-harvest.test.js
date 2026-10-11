'use strict';

/**
 * MRB #1441 hostile pin: reciprocal sibling enable-FR stay-dark after keep-both.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'After concurrent Phase-4 enable keep-both, retarget each sibling enable-FR synth stay-dark list so neither lists the other as dark (fr172 must not assert tradedoubler dark; fr174 must not assert partnerize dark).';

test('mrb1441: reciprocal sibling stay-dark harvest lesson contiguous UTF-8 no BOM', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'reciprocal sibling stay-dark lesson must stay contiguous');
  assert.ok(text.includes('fr172 must not assert tradedoubler dark'));
  assert.ok(text.includes('fr174 must not assert partnerize dark'));
  assert.ok(text.endsWith('\n') || text.endsWith('\r\n'));
});
