'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const skill = path.join(root, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

describe('mrb2409 hostile FR-248 stamp+NNN lesson', () => {
  it('harvest-agent-skills carries contiguous FR-248 stamp+NNN lesson (ASCII)', () => {
    const raw = fs.readFileSync(skill);
    assert.ok(!(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf), 'SKILL.md must be UTF-8 without BOM');
    const text = raw.toString('utf8');
    const needle = 'a-search FR-248 MRB: when tip changes stamp param names';
    assert.ok(text.includes(needle), 'missing contiguous FR-248 stamp lesson');
    const idx = text.indexOf(needle);
    const window = text.slice(idx, idx + needle.length + 180);
    assert.ok(window.includes('fr083/089/092/098'), 'queryParts suite list truncated');
    assert.ok(window.includes('renumber migrations past open sibling NNN'), 'NNN renumber clause truncated');
  });
});
