'use strict';

/**
 * docs/mrb-2450 hostile pin: docs/mrb blocked by stay-dark -> one fix PR fold.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const SKILL = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

const LESSON =
  'When docs/mrb tip is BLOCKED only by pre-existing main stay-dark asserts after a provider enable FR, open one fix PR updating those pins (Closes the intake FR), fold the fix into the assigned tip so CI can go green, arm auto-merge on both, DONE PASS without waiting (FR #3948).';

describe('docs/mrb-2450 hostile docs/mrb stay-dark fix-fold lesson', () => {
  it('SKILL.md contiguous docs/mrb stay-dark fix PR fold lesson', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(LESSON), 'full lesson present');
    const line = text
      .split(/\r?\n/)
      .find((l) => l.includes('docs/mrb tip is BLOCKED only by pre-existing main stay-dark'));
    assert.ok(line, 'lesson line present');
    assert.equal(line.includes('\u2014'), false, 'no em-dash');
    assert.equal(line.includes('\u2013'), false, 'no en-dash');
  });
});
