'use strict';

/**
 * docs/mrb-2341 hostile pin: harvest-lesson re-offer without self-MRB merge-push.
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
  'Harvest-lesson re-offer: if this seat did not author tip commits, re-verify hostile + 0-behind and DONE PASS; do not push merge commits that create self-MRB';

describe('docs/mrb-2341 hostile harvest-lesson re-offer lesson', () => {
  it('SKILL.md contiguous re-offer without self-MRB merge-push', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(LESSON), 'full lesson present');
    const line = text.split(/\r?\n/).find((l) => l.includes('Harvest-lesson re-offer:'));
    assert.ok(line, 'lesson line present');
    assert.equal(line.includes('\u2014'), false, 'no em-dash');
    assert.equal(line.includes('\u2013'), false, 'no en-dash');
  });
});
