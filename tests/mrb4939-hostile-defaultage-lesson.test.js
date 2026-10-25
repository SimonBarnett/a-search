'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
describe('MRB #4939 harvest pin defaultage self-heal', () => {
  it('keeps affiliate defaultage self-heal bullet contiguous', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md'), 'utf8');
    assert.match(src, /Affiliate age is defaultage \(merchant > provider > _root\); self-heal missing _root only \(create-only defaultage=7\); never overwrite an existing invalid root\./);
  });
});
