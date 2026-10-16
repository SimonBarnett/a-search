'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE =
  'Enable-provider tip (woocommerce keep-both wix): after FR-2139, fr142 must filter QueueName .fifo and fr143 must count worker -dlq alarms only; also fix wix .env.example madeiradb->a_search (FR-251) when FR-119/121 fail on enable tips.';
test('mrb2496: enable-provider fifo + FR-251 wix env lesson contiguous', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'no BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE));
  assert.ok(text.includes('QueueName .fifo'));
  assert.ok(text.includes('worker -dlq'));
  assert.ok(text.includes('madeiradb->a_search'));
  assert.ok(text.includes('FR-251'));
});