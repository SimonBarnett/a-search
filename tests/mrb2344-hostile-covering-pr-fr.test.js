'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const skill = path.join(root, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

describe('mrb2344 hostile covering-PR FR hygiene', () => {
  it('harvest-agent-skills carries contiguous covering-PR lesson (ASCII)', () => {
    const raw = fs.readFileSync(skill);
    assert.ok(!(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf), 'SKILL.md must be UTF-8 without BOM');
    const text = raw.toString('utf8');
    const needle = 'Assigned FR with open covering PR that already Closes it';
    assert.ok(text.includes(needle), 'missing contiguous covering-PR lesson');
    const idx = text.indexOf(needle);
    const window = text.slice(idx, idx + needle.length + 120);
    assert.ok(window.includes('verify closingIssuesReferences'), 'lesson mid truncated');
    assert.ok(window.includes('never open a second implement PR'), 'lesson tail truncated');
  });
});
