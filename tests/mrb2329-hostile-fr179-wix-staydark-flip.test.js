'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const skill = path.join(root, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

describe('mrb2329 hostile FR-179 wix stay-dark flip lesson', () => {
  it('harvest-agent-skills carries contiguous FR-106/FR-108 stay-dark flip lesson (ASCII)', () => {
    const raw = fs.readFileSync(skill);
    // no UTF-8 BOM
    assert.ok(!(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf), 'SKILL.md must be UTF-8 without BOM');
    const text = raw.toString('utf8');
    const needle = 'After FR-179 enabled wix, flip FR-106/FR-108 stay-dark asserts';
    assert.ok(text.includes(needle), 'missing contiguous FR-179 stay-dark flip lesson');
    const idx = text.indexOf(needle);
    const window = text.slice(idx, idx + needle.length + 80);
    assert.ok(window.includes('blocks unrelated auto-merges'), 'lesson tail truncated');
  });
});
