'use strict';

/** docs/mrb-4623: pin fill-madeira AMAZON_CREATORS_CREDENTIAL harvest lesson. */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('docs/mrb-4623 harvest creators-credential pin', () => {
  it('harvest-agent-skills pins fill-madeira AMAZON_CREATORS_CREDENTIAL mapping', () => {
    const p = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
    const src = fs.readFileSync(p, 'utf8');
    assert.match(src, /AMAZON_CREATORS_CREDENTIAL/);
    assert.match(src, /creators-credential/);
    assert.match(src, /required=false/);
    assert.match(src, /never print SSM values/i);
  });
});
