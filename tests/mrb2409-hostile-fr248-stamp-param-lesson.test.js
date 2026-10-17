'use strict';

/**
 * docs/mrb-2409: hostile pin FR-248 stamp param + migration NNN lesson.
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
  'a-search FR-248 MRB: when tip changes stamp param names, update older affiliate queryParts suites (fr083/089/092/098) in the same tip; also renumber migrations past open sibling NNN claims before PASS';

describe('mrb2409 hostile FR-248 stamp param suites lesson', () => {
  it('SKILL.md contiguous FR-248 stamp/queryParts lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('FR-248 MRB: when tip changes stamp param'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
    assert.equal(line.includes('\u2013'), false);
  });
});
