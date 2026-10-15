'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
describe('docs/mrb-2121 CONFLICTING SKILL restatement FAIL-supersede', () => {
  it('pins contiguous restating CONFLICTING SKILL + FAIL-supersede + first PR', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef);
    const text = buf.toString('utf8');
    assert.match(text, /restating CONFLICTING SKILL\.md checkout\/cat-file UTF8 append/);
    assert.match(text, /FAIL-supersede citing the first PR/);
  });
});