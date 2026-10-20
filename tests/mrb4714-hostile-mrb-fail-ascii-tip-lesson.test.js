'use strict';

/** docs/mrb-4714: pin MRB FAIL ASCII-tip harvest lesson (PR #4714). */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('docs/mrb-4714 MRB FAIL ASCII tip lesson', () => {
  it('harvest-agent-skills pins MRB FAIL ASCII tip fix-PR wire', () => {
    const p = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
    const raw = fs.readFileSync(p);
    assert.notEqual(raw[0], 0xef, 'no UTF-8 BOM');
    const src = raw.toString('utf8');
    assert.match(src, /MRB FAIL on ASCII tip/);
    assert.match(src, /ASCII normalize \+ hostile pin/);
    assert.match(src, /Refs not second Closes/);
    assert.match(src, /DONE FAIL/);
    assert.match(src, /re-queue re-board/);
    // tip bullet must stay ASCII (fr4208 class)
    const line = src.split(/\r?\n/).find((l) => l.includes('MRB FAIL on ASCII tip'));
    assert.ok(line, 'lesson line present');
    for (const ch of line) {
      assert.ok(ch.charCodeAt(0) < 128, `non-ASCII in lesson: U+${ch.charCodeAt(0).toString(16)}`);
    }
  });
});