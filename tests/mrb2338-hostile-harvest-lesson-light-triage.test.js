'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const skill = path.join(root, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

describe('mrb2338 hostile harvest-lesson light-triage meta', () => {
  it('harvest-agent-skills carries contiguous light-triage ambient-CI lesson (ASCII)', () => {
    const raw = fs.readFileSync(skill);
    assert.ok(!(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf), 'SKILL.md must be UTF-8 without BOM');
    const text = raw.toString('utf8');
    const needle = 'Harvest-lesson MRB: light triage useful/general/non-dup/vision';
    assert.ok(text.includes(needle), 'missing contiguous harvest-lesson light-triage lesson');
    const idx = text.indexOf(needle);
    const window = text.slice(idx, idx + needle.length + 120);
    assert.ok(window.includes('ambient fr106/108 wix red is #2335'), 'lesson mid truncated');
    assert.ok(window.includes('not FAIL of the lesson tip'), 'lesson tail truncated');
  });
});
