'use strict';

/**
 * MRB #1203 hostile pin: FR-143 LogGroup / DLQ alarm harvest lesson contiguous
 * in harvest-agent-skills.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const MRB_DOC = path.join(ROOT, 'docs', 'mrb', 'mrb-1203.md');

const NEEDLE =
  'FR-143: prefer lambda logGroup: new logs.LogGroup({retention:ONE_MONTH}) over deprecated logRetention (Custom::LogRetention); DLQ alarms need FR-142 sibling queues; ApproximateNumberOfMessagesVisible >= 1 -> SnsAction on placeholder topic';

test('mrb1203: FR-143 LogGroup harvest lesson contiguous', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md UTF-8 no BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'FR-143 harvest lesson must stay contiguous');
  assert.ok(text.includes('logs.LogGroup({retention:ONE_MONTH})'));
  assert.ok(text.includes('deprecated logRetention'));
  assert.ok(text.includes('Custom::LogRetention'));
  assert.ok(text.includes('ApproximateNumberOfMessagesVisible >= 1'));
  assert.ok(text.includes('SnsAction on placeholder topic'));
});

test('mrb1203: docs/mrb/mrb-1203.md cites covering PRs', () => {
  const raw = fs.readFileSync(MRB_DOC);
  assert.notEqual(raw[0], 0xef, 'mrb-1203.md UTF-8 no BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes('#1203'));
  assert.ok(text.includes('#1202'));
  assert.ok(text.includes('FR-143'));
  assert.ok(text.includes('harvest-agent-skills'));
  assert.ok(text.includes(NEEDLE.split(';')[0]));
});
