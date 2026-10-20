'use strict';

/** docs/mrb-4727: pin FR #4650 envVars gate SQS LIVE_URL test lesson (PR #4727). */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('docs/mrb-4727 FR #4650 envVars gate LIVE_URL lesson', () => {
  it('harvest-agent-skills pins SQS_<SOURCE>_LIVE_URL for fan-out tests', () => {
    const p = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
    const raw = fs.readFileSync(p);
    assert.notEqual(raw[0], 0xef, 'no UTF-8 BOM');
    const src = raw.toString('utf8');
    assert.match(src, /After FR #4650 envVars gate/);
    assert.match(src, /handleAgentSearch test that expects fan-out/);
    assert.match(src, /SQS_<SOURCE>_LIVE_URL/);
    assert.match(src, /fr4265/);
    const line = src.split(/\r?\n/).find((l) => l.includes('SQS_<SOURCE>_LIVE_URL'));
    assert.ok(line, 'lesson line present');
    for (const ch of line) {
      assert.ok(ch.charCodeAt(0) < 128, `non-ASCII in lesson: U+${ch.charCodeAt(0).toString(16)}`);
    }
  });
});
