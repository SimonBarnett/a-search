'use strict';

/**
 * MRB #2095 docs/hostile: FR-236 merchantShops HTTP 400 mapping harvest lesson.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE =
  'a-search FR-236: merchantShops callback must map adapter codes invalid_hmac/invalid_shop_domain/code_required to HTTP 400 so bad oauth never inserts a Shop row; pin with HTTP-layer bad-hmac after a fresh connect state';

describe('MRB #2095 hostile FR-236 hmac HTTP 400 lesson', () => {
  it('pins contiguous merchantShops HTTP 400 oauth playbook', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'lesson must stay contiguous');
    assert.match(text, /invalid_hmac/);
    assert.match(text, /invalid_shop_domain/);
    assert.match(text, /code_required/);
    assert.match(text, /HTTP 400/);
    // keep-both recent
    assert.match(text, /EventBridge cannot set dynamic SQS FIFO MessageGroupId/);
    assert.match(text, /a-search docs\/mrb for open product tip/);
    assert.doesNotMatch(NEEDLE, /[\u2014\u2013]/);
  });
});