'use strict';

/**
 * docs/mrb-2254: hostile pin for harvest-lesson self-MRB docs/mrb-after-open-tip.
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
  'MRB docs/mrb after harvest tip: if the tip is still open and this seat authored it (self-MRB), GIVEUP the docs/mrb assign; do not merge the tip; sibling merges tip first then re-offers docs/mrb.';

describe('docs/mrb-2254 hostile self-MRB docs/mrb after open tip', () => {
  it('SKILL.md pins GIVEUP docs/mrb when this seat authored still-open tip', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.match(text, new RegExp(LESSON.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const line = text.split(/\r?\n/).find((l) => l.includes('MRB docs/mrb after harvest tip'));
    assert.ok(line, 'lesson line present');
    assert.equal(line.includes('\u2014'), false, 'new lesson has no em-dash');
    assert.equal(line.includes('\u2013'), false, 'new lesson has no en-dash');
  });
});
