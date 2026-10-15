'use strict';

/**
 * docs/mrb-2280: hostile pin for enable-provider CONFLICTING-after-sibling harvest tip.
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
  'enable-provider CONFLICTING-after-sibling harvest tip that restates Phase-4 merchant keep-both already on main: FAIL-supersede close Duplicate; cite main CAST IRON + earlier twin tip';

describe('docs/mrb-2280 hostile enable-provider CONFLICTING-after-sibling lesson', () => {
  it('SKILL.md pins FAIL-supersede for Phase-4 keep-both tip-loop harvest', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(LESSON), 'full lesson present');
    const line = text
      .split(/\r?\n/)
      .find((l) => l.includes('enable-provider CONFLICTING-after-sibling'));
    assert.ok(line, 'lesson line present');
    assert.equal(line.includes('\u2014'), false, 'no em-dash');
    assert.equal(line.includes('\u2013'), false, 'no en-dash');
  });
});