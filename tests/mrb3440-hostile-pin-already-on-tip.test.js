'use strict';

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

const NEEDLE =
  'When an a-search harvest-lesson tip is 0 behind main, adds one ASCII lesson line, and already contains its hostile pin test, PASS and arm gh pr merge --auto --squash; do not open a second docs/mrb PR that repeats that pin.';

describe('mrb3440 pin already on the harvest tip', () => {
  it('SKILL.md pins the 0-behind pin-already-present bullet as one ASCII line', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'UTF-8 no BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE));
    const line = text.split(/\r?\n/).find((row) => row.includes('0 behind main, adds one ASCII lesson line'));
    assert.ok(line, 'bullet line present');
    for (let i = 0; i < line.length; i++) {
      assert.ok(line.charCodeAt(i) < 128, 'bullet must be ASCII');
    }
  });
});
