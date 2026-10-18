'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
describe('docs/mrb-2111 self-MRB restatement FAIL-supersede', () => {
  it('pins contiguous restating self-MRB + FAIL-supersede + first PR/SKILL bullet', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef);
    const text = buf.toString('utf8');
    assert.match(text, /restating self-MRB keep-both GIVEUP/);
    assert.match(text, /FAIL-supersede citing the first PR\/SKILL bullet/);
  });
});