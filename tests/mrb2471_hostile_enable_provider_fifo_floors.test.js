'use strict';

/**
 * MRB #2471 hostile pin: Enable-provider tip floors after FR-2139 shop-sync FIFO
 * contiguous in harvest-agent-skills.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'Enable-provider tip floors: after FR-2139 shop-sync FIFO, fr142 primary filter must exclude QueueName containing .fifo (shop-sync + shop-sync-dlq both counted as primaries otherwise: 2*enabled+2); fr143 alarm floor counts worker -dlq only (shop-sync DLQ alarm is +1). Always add the new id to ENABLED_IDS when bumping 2*N floors.';

test('mrb2471: enable-provider FR-2139 fifo floor lesson contiguous', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md UTF-8 no BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'Enable-provider FR-2139 fifo floors lesson must stay contiguous');
  assert.ok(text.includes('QueueName containing .fifo'));
  assert.ok(text.includes('2*enabled+2'));
  assert.ok(text.includes('worker -dlq only'));
  assert.ok(text.includes('ENABLED_IDS'));
  assert.ok(text.includes('FR-2139 shop-sync FIFO'));
});