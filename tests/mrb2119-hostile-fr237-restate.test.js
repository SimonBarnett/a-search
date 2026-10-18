'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
describe('docs/mrb-2119 FR-237 restatement FAIL-supersede', () => {
  it('pins contiguous FR-237 product+docs/mrb restating + FAIL-supersede + do not re-fold', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef);
    const text = buf.toString('utf8');
    assert.match(text, /harvest tip after FR-237 product\+docs\/mrb/);
    assert.match(text, /FAIL-supersede citing product\/docs PR/);
    assert.match(text, /do not re-fold/);
  });
});