'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
describe('docs/mrb-2143 FR-238 restatement FAIL-supersede', () => {
  it('pins contiguous restating FR-238 Woo + FAIL-supersede + first PR', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef);
    const text = buf.toString('utf8');
    assert.match(text, /restating FR-238 Woo SSRF\/wc-auth\/key_permissions lesson/);
    assert.match(text, /FAIL-supersede citing the first PR/);
  });
});