'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const skill = path.join(root, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

describe('mrb2389 hostile docs/mrb migration NNN sync', () => {
  it('harvest-agent-skills carries contiguous docs/mrb migration NNN lesson (ASCII)', () => {
    const raw = fs.readFileSync(skill);
    assert.ok(!(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf), 'SKILL.md must be UTF-8 without BOM');
    const text = raw.toString('utf8');
    const needle = 'a-search docs/mrb stacked on product tip: before PASS, sync migration NNN';
    assert.ok(text.includes(needle), 'missing contiguous docs/mrb migration NNN lesson');
    const idx = text.indexOf(needle);
    const window = text.slice(idx, idx + needle.length + 140);
    assert.ok(window.includes('sibling collision fix'), 'lesson mid truncated');
    assert.ok(window.includes('does not reintroduce the old NNN file on squash'), 'lesson tail truncated');
  });
});
