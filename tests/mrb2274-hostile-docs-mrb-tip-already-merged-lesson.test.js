'use strict';

/**
 * docs/mrb-2274: hostile pin for harvest-lesson docs/mrb when tip already MERGED.
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
  'docs/mrb when tip already MERGED: merge origin/main into docs tip, run hostile pin green, then merge docs/mrb (admin if Actions QUEUED)';

describe('docs/mrb-2274 hostile docs/mrb when tip already MERGED', () => {
  it('SKILL.md pins merge-main then pin-green then merge docs/mrb', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.match(text, new RegExp(LESSON.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const line = text.split(/\r?\n/).find((l) => l.includes('docs/mrb when tip already MERGED'));
    assert.ok(line, 'lesson line present');
    assert.equal(line.includes('\u2014'), false, 'no em-dash');
    assert.equal(line.includes('\u2013'), false, 'no en-dash');
  });
});