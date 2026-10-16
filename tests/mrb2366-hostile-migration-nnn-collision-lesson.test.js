'use strict';

/**
 * docs/mrb-2366 hostile pin: migration NNN collision renumber on product MRB.
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

const LESSON =
  'a-search product MRB: when two open tips both add the same db/migrations/NNN_*.sql number, renumber the assigned tip to next free NNN before PASS; leave sibling tip alone';

describe('docs/mrb-2366 hostile migration NNN collision lesson', () => {
  it('SKILL.md contiguous renumber-assigned-tip migration lesson', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(LESSON), 'full lesson present');
    const line = text
      .split(/\r?\n/)
      .find((l) => l.includes('db/migrations/NNN_*.sql'));
    assert.ok(line, 'lesson line present');
    assert.equal(line.includes('\u2014'), false, 'no em-dash');
    assert.equal(line.includes('\u2013'), false, 'no en-dash');
  });
});
