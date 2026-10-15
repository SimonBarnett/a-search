'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const skill = path.join(root, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

describe('mrb2372 hostile enable-provider stay-dark suites', () => {
  it('harvest-agent-skills carries contiguous enable-provider stay-dark lesson (ASCII)', () => {
    const raw = fs.readFileSync(skill);
    assert.ok(!(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf), 'SKILL.md must be UTF-8 without BOM');
    const text = raw.toString('utf8');
    const needle = 'a-search enable-provider MRB: when flipping registry enabled true';
    assert.ok(text.includes(needle), 'missing contiguous enable-provider stay-dark lesson');
    const idx = text.indexOf(needle);
    const window = text.slice(idx, idx + needle.length + 160);
    assert.ok(window.includes('older stay-dark suites'), 'lesson mid truncated');
    assert.ok(window.includes('fr088 webgains'), 'webgains example missing');
    assert.ok(window.includes('fr106/fr108 wix'), 'wix example missing');
  });
});
