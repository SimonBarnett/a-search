'use strict';

/**
 * FR #3610: harvest twin cleanup must not close by guessed PR number.
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

const NEEDLE =
  'Harvest twin cleanup after Invoke-BobiverseHarvest: close only the PR number from that harvest url, and only when it carries the harvest-lesson label; never close by a guessed nearby number (class of #3610 / mistaken close of product tip #3608).';

describe('FR #3610 harvest twin close guard', () => {
  it('pins contiguous harvest-url + harvest-lesson label close playbook (ASCII no BOM)', () => {
    const buf = fs.readFileSync(skillPath);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'contiguous harvest twin cleanup bullet missing');
    assert.match(text, /harvest-lesson label/);
    assert.match(text, /never close by a guessed nearby number/);
    assert.match(text, /#3610/);
    assert.match(text, /#3608/);
    assert.doesNotMatch(NEEDLE, /[\u2014\u2013]/);
  });
});