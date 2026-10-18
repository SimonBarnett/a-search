'use strict';

/**
 * MRB #2096 docs/hostile: harvest-lesson self-MRB keep-both author playbook.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE =
  'a-search harvest-lesson MRB: if tip commits include marchhare-<seat> keep-both author, ACK then GIVEUP self-MRB (FR #2604); leave OPEN for sibling; CONFLICTING does not change the hand-back';

describe('MRB #2096 hostile self-MRB keep-both author lesson', () => {
  it('pins contiguous self-MRB keep-both author playbook', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'lesson must stay contiguous');
    assert.match(text, /GIVEUP self-MRB/);
    assert.match(text, /FR #2604/);
    assert.match(text, /CONFLICTING does not change the hand-back/);
    assert.match(text, /invalid_hmac\/invalid_shop_domain/);
    assert.match(text, /EventBridge cannot set dynamic SQS FIFO MessageGroupId/);
    assert.doesNotMatch(NEEDLE, /[\u2014\u2013]/);
  });
});