'use strict';

/** docs/mrb-2076: hostile pin EventBridge FIFO MessageGroupId enqueue-Lambda lesson */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

describe('mrb2076 hostile EventBridge MessageGroupId lesson', () => {
  it('harvest-agent-skills records enqueue-Lambda MessageGroupId playbook', () => {
    const skill = fs.readFileSync(
      path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md'),
      'utf8',
    );
    assert.match(
      skill,
      /EventBridge cannot set dynamic SQS FIFO MessageGroupId/,
    );
    assert.match(skill, /enqueue Lambda/);
    assert.match(skill, /agentQueue\.classify|fifoSendParams/);
  });
});