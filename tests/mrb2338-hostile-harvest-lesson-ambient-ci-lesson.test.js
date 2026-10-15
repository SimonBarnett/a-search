'use strict';

/**
 * docs/mrb-2338: hostile pin harvest-lesson ambient fr106/108 not FAIL.
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
  'Harvest-lesson MRB: light triage useful/general/non-dup/vision; merge behind-main; ambient fr106/108 wix red is #2335 not FAIL of the lesson tip';

describe('mrb2338 hostile harvest-lesson ambient CI not FAIL', () => {
  it('SKILL.md contiguous light-triage ambient fr106/108 lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('Harvest-lesson MRB: light triage'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
    assert.equal(line.includes('\u2013'), false);
  });
});
