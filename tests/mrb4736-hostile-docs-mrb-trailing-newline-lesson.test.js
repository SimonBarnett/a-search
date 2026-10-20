'use strict';

/** docs/mrb-4736: pin trailing-newline docs/mrb harvest lesson (PR #4736). */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('docs/mrb-4736 trailing newline docs/mrb pin lesson', () => {
  it('harvest-agent-skills pins trailing newline before PASS for docs/mrb tests', () => {
    const p = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
    const raw = fs.readFileSync(p);
    assert.notEqual(raw[0], 0xef, 'no UTF-8 BOM');
    const src = raw.toString('utf8');
    assert.match(src, /docs\/mrb pin new test files need a trailing newline before PASS/);
    assert.match(src, /pin harvest lesson needles already on main/);
    const line = src.split(/\r?\n/).find((l) => l.includes('trailing newline before PASS'));
    assert.ok(line, 'lesson line present');
    for (const ch of line) {
      assert.ok(ch.charCodeAt(0) < 128, `non-ASCII in lesson: U+${ch.charCodeAt(0).toString(16)}`);
    }
  });

  it('this pin file itself ends with a trailing newline', () => {
    const self = fs.readFileSync(__filename);
    assert.ok(self.length > 0 && self[self.length - 1] === 0x0a, 'trailing LF required');
  });
});
