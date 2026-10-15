'use strict';

/**
 * docs/mrb-2110: hostile pin complementary meta tip FAIL-supersede lesson.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

describe('docs/mrb-2110 complementary meta tip', () => {
  it('pins contiguous complementary open tip + FAIL-superseded + close meta tip', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.match(text, /complementary open tip/);
    assert.match(text, /FAIL-superseded as product tip-loop/);
    assert.match(text, /close the meta tip too/);
    assert.match(text, /do not re-open both/);
  });
});