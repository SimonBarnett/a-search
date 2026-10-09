'use strict';

/**
 * MRB #1182 hostile pin: FR-142 SQS DLQ harvest lesson contiguous in harvest-agent-skills.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE = 'FR-142 SQS DLQ: sibling {queueName}-dlq (14d retention) + deadLetterQueue:{queue,maxReceiveCount:3} on primary; pin RedrivePolicy via in-process app.synth (not npm spawn) for all live/sandbox enabled sources; alarms stay FR-143';

test('mrb1182: FR-142 SQS DLQ harvest lesson contiguous ASCII', () => {
  const raw = fs.readFileSync(SKILL);
  assert.equal(raw[0], 0x2d, 'SKILL.md UTF-8 no BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'FR-142 harvest lesson must stay contiguous');
  assert.ok(text.includes('maxReceiveCount:3'));
  assert.ok(text.includes('in-process app.synth'));
  assert.ok(text.includes('alarms stay FR-143'));
  assert.ok(text.includes('{queueName}-dlq'));
});