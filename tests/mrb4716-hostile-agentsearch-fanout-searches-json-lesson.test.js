'use strict';

/** docs/mrb-4716: pin AgentSearchFanoutMarker searches.json IAM harvest lesson (PR #4716). */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('docs/mrb-4716 AgentSearchFanoutMarker searches.json IAM', () => {
  it('harvest-agent-skills pins searches.json PutObject on AgentSearchFanoutMarker', () => {
    const p = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
    const raw = fs.readFileSync(p);
    assert.notEqual(raw[0], 0xef, 'no UTF-8 BOM');
    const src = raw.toString('utf8');
    assert.match(src, /AgentSearchFanoutMarker must PutObject/);
    assert.match(src, /a-clubs\/\*\/\*\/searches\.json/);
    assert.match(src, /not only search-fanout\.json/);
    assert.match(src, /#4563/);
    const line = src.split(/\r?\n/).find((l) => l.includes('AgentSearchFanoutMarker must PutObject'));
    assert.ok(line, 'lesson line present');
    for (const ch of line) {
      assert.ok(ch.charCodeAt(0) < 128, `non-ASCII in lesson: U+${ch.charCodeAt(0).toString(16)}`);
    }
  });
});