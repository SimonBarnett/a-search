'use strict';

/**
 * docs/mrb-2454 hostile pin: harvest-lesson re-offer docs/mrb reuse vs tip-has-hostile.
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
  'Harvest-lesson re-offer: if tip already carries lesson+hostile, close any docs/mrb as twin (do not reopen); if tip lacks hostile and docs/mrb-N is already open, reuse that docs/mrb (do not open another); arm --auto --squash; ambient stay-dark CI is not a lesson FAIL (FR #3948).';

describe('docs/mrb-2454 hostile harvest-lesson re-offer docs/mrb rule', () => {
  it('SKILL.md contiguous re-offer tip-has-hostile vs reuse docs/mrb', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(LESSON), 'full lesson present');
    assert.equal(text.includes('reuse it'), false, 'must not cite stale reuse #2291 path');
    assert.equal(text.includes('#2291'), false, 'must not hard-pin closed #2291');
    const line = text.split(/\r?\n/).find((l) => l.includes('Harvest-lesson re-offer:'));
    assert.ok(line, 'lesson line present');
    assert.equal(line.includes('\u2014'), false, 'no em-dash');
    assert.equal(line.includes('\u2013'), false, 'no en-dash');
  });
});
