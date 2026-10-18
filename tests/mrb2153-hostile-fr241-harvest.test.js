'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
describe('docs/mrb-2153 FR-241 unpaid harvest lesson', () => {
  it('pins contiguous FR-241 unpaid + N2>=7d + login retained + active-only', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef);
    const text = buf.toString('utf8');
    assert.match(text, /FR-241 unpaid\/dunning/);
    assert.match(text, /N2>=7d before delete/);
    assert.match(text, /merchant login retained/);
    assert.match(text, /active-only downloads/);
    assert.match(text, /hard-delete Parts\/PartFeedKeys\/vault per shop/);
  });
});