'use strict';

/**
 * docs/mrb-2344: hostile pin covering-PR FR DONE lesson.
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
  'Assigned FR with open covering PR that already Closes it: verify closingIssuesReferences + tests, DONE with that PR URL; never open a second implement PR';

describe('mrb2344 hostile covering-PR FR DONE lesson', () => {
  it('SKILL.md contiguous covering-PR lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('Assigned FR with open covering PR'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
    assert.equal(line.includes('\u2013'), false);
  });
});
