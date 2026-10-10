'use strict';

/**
 * MRB #1303 hostile pin: FR-162 SQS SSE harvest lesson contiguous
 * in harvest-agent-skills (product #1302 / tip #1303).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'Worker SQS queues and FR-142 DLQs need encryption: sqs.QueueEncryption.SQS_MANAGED (SSE-SQS); pin via synth SqsManagedSseEnabled; CMK per queue stays OOS (FR-162 / #1005).';

test('mrb1303: FR-162 SQS SSE harvest lesson contiguous UTF-8 no BOM', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'FR-162 harvest lesson must stay contiguous');
  assert.ok(text.includes('QueueEncryption.SQS_MANAGED'));
  assert.ok(text.includes('SqsManagedSseEnabled'));
  assert.ok(text.includes('SSE-SQS'));
  assert.ok(text.includes('FR-162'));
  assert.ok(text.includes('#1005'));
  assert.ok(text.endsWith('\n') || text.endsWith('\r\n'), 'trailing newline');
});
