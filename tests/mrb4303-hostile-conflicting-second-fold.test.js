'use strict';

/**
 * docs/mrb-4303 hostile pin: one keep-both fold, then no second fold.
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

const NEEDLE =
  'Harvest-lesson CONFLICTING tip: one origin/main keep-both fold then PASS; if tip races CONFLICTING again leave --auto armed and DONE PASS without a second fold (FR #3948)';

describe('MRB #4303 hostile one fold then stop', () => {
  it('pins the keep-both second-race lesson as one contiguous ASCII bullet', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    assert.equal(buf[buf.length - 1], 0x0a, 'trailing newline');
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'contiguous second-fold lesson');
    assert.ok(
      text.includes('120s limit after a larger prompt'),
      '120s page-review lesson still present',
    );
  });
});
