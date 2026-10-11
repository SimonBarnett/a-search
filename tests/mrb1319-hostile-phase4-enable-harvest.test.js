'use strict';

/**
 * MRB #1319 hostile pin: Phase-4 enable FR harvest lesson
 * contiguous in harvest-agent-skills (tip #1319).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'Phase-4 enable FR: flip one registry id both envs, add PROVIDER_CREDENTIAL_KEYS + PLAIN_DEFAULTS, update stay-dark pins/docs that asserted that id false, pin frN with in-process synth for a-search-{id}-{live,sandbox}';

test('mrb1319: Phase-4 enable FR harvest lesson contiguous UTF-8 no BOM', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'Phase-4 enable harvest lesson must stay contiguous');
  assert.ok(text.includes('PROVIDER_CREDENTIAL_KEYS'));
  assert.ok(text.includes('PLAIN_DEFAULTS'));
  assert.ok(text.includes('stay-dark'));
  assert.ok(text.includes('a-search-{id}-{live,sandbox}'));
  assert.ok(text.endsWith('\n') || text.endsWith('\r\n'), 'trailing newline');
});
