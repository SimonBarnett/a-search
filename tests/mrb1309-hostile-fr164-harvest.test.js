'use strict';

/**
 * MRB #1309 hostile pin: FR-164 SQS visibilityTimeout harvest lesson contiguous
 * in harvest-agent-skills (product #1308 / tip #1309).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'SQS->Lambda worker queues need visibilityTimeout > function timeout; LOCK 6x via shared WORKER_* constants and synth-pin every enabled queue (FR-164 / #1007).';

test('mrb1309: FR-164 visibilityTimeout harvest lesson contiguous UTF-8 no BOM', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'FR-164 harvest lesson must stay contiguous');
  assert.ok(text.includes('visibilityTimeout > function timeout'));
  assert.ok(text.includes('WORKER_*'));
  assert.ok(text.includes('6x'));
  assert.ok(text.includes('FR-164'));
  assert.ok(text.includes('#1007'));
  assert.ok(text.endsWith('\n') || text.endsWith('\r\n'), 'trailing newline');
});
