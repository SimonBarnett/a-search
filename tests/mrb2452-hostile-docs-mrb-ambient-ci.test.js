'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const skill = path.join(root, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

describe('mrb2452 hostile docs/mrb ambient stay-dark CI', () => {
  it('harvest-agent-skills carries contiguous ambient stay-dark PASS lesson (ASCII)', () => {
    const raw = fs.readFileSync(skill);
    assert.ok(!(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf), 'SKILL.md must be UTF-8 without BOM');
    const text = raw.toString('utf8');
    const needle = 'MRB docs/hostile tip: when CI fails only on unrelated stay-dark asserts';
    assert.ok(text.includes(needle), 'missing contiguous ambient stay-dark PASS lesson');
    const idx = text.indexOf(needle);
    const window = text.slice(idx, idx + needle.length + 200);
    assert.ok(window.includes('PASS the assigned head'), 'PASS clause truncated');
    assert.ok(window.includes('file a separate FR for the stale asserts'), 'separate FR clause truncated');
    assert.ok(window.includes('do not FAIL the docs/mrb PR'), 'do-not-FAIL clause truncated');
  });
});
