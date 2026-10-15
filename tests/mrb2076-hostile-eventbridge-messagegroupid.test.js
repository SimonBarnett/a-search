'use strict';

/**
 * docs/mrb-2076: hostile pin EventBridge FIFO MessageGroupId enqueue-Lambda lesson
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const NEEDLE =
  'EventBridge cannot set dynamic SQS FIFO MessageGroupId from S3 key alone: use a small enqueue Lambda that runs agentQueue.classify/fifoSendParams before the rclone-host dispatcher polls';

describe('mrb2076 hostile EventBridge MessageGroupId lesson', () => {
  it('harvest-agent-skills records enqueue-Lambda MessageGroupId playbook', () => {
    const buf = fs.readFileSync(
      path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md'),
    );
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const skill = buf.toString('utf8');
    assert.ok(skill.includes(NEEDLE), 'lesson must stay contiguous');
    assert.match(skill, /enqueue Lambda/);
    assert.match(skill, /agentQueue\.classify|fifoSendParams/);
    assert.doesNotMatch(NEEDLE, /[\u2014\u2013]/);
  });
});