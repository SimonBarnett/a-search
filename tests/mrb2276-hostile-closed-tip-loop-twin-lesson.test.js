'use strict';

/**
 * docs/mrb-2276: hostile pin for harvest-lesson closed ExistingPrUrl tip-loop twin.
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
  'assigned harvest tip already CLOSED as ExistingPrUrl tip-loop twin: board FAIL-supersede, cite first substance tip if different from ExistingPrUrl (or main CAST IRON when substance already landed), leave closed, DONE FAIL';

describe('docs/mrb-2276 hostile closed ExistingPrUrl tip-loop twin lesson', () => {
  it('SKILL.md pins FAIL-supersede board when assigned tip already CLOSED', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(LESSON), 'full lesson present');
    const line = text.split(/\r?\n/).find((l) => l.includes('assigned harvest tip already CLOSED'));
    assert.ok(line, 'lesson line present');
    assert.equal(line.includes('\u2014'), false, 'no em-dash');
    assert.equal(line.includes('\u2013'), false, 'no en-dash');
  });
});
