'use strict';

/**
 * docs/mrb-2038 hostile pin for harvest tip #2038
 * (CLOSED harvest tip superseded by docs/mrb stack).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skillPath = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

describe('MRB-2038 harvest lesson CLOSED tip superseded by docs/mrb', () => {
  it('SKILL.md contiguous CLOSED-superseded docs/mrb pins', () => {
    const buf = fs.readFileSync(skillPath);
    assert.notEqual(buf[0], 0xef, 'UTF-8 no BOM');
    const text = buf.toString('utf8');
    assert.match(text, /CLOSED superseded by docs\/mrb stack/);
    assert.match(text, /lesson bullet \+ hostile pin/);
    assert.match(text, /merge origin\/main keep-both/);
    assert.match(text, /verify needle\+test/);
    assert.match(text, /do not reopen the closed parent tip/);
    assert.doesNotMatch(text, /^<<<<<<<|^=======|^>>>>>>>/m);
  });
});
