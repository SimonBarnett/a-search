'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
describe('docs/mrb-2138 FR-240 shop sync harvest lesson', () => {
  it('pins contiguous no-cred SQS + active-only + Kind=shop + soft-delete', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef);
    const text = buf.toString('utf8');
    assert.match(text, /FR-240: shop sync SQS messages must never carry credentials/);
    assert.match(text, /subscriptionStatus=active \(trialing unpaid\)/);
    assert.match(text, /PartFeedKeys Kind=shop FeedKey=shopId/);
    assert.match(text, /soft-delete Parts on suspend/);
  });
});