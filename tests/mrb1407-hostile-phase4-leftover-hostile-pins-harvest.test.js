'use strict';

/**
 * MRB #1407 hostile pin: Phase-4 leftover hostile pins (title says enabled, assert still false)
 * contiguous in harvest-agent-skills (assigned tip #1407; landed via fix PR).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'Phase-4 enable: after flipping registry+stay-dark lists, also flip leftover hostile pins that still assert the id enabled=false (title may already say FR-N enabled while asserts stay false)';

test('mrb1407: Phase-4 leftover hostile pins harvest lesson contiguous UTF-8 no BOM', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'Phase-4 leftover hostile pins lesson must stay contiguous');
  assert.ok(text.includes('leftover hostile pins'));
  assert.ok(text.includes('enabled=false'));
  assert.ok(text.includes('title may already say FR-N enabled'));
  assert.ok(text.endsWith('\n') || text.endsWith('\r\n'), 'trailing newline');
});
