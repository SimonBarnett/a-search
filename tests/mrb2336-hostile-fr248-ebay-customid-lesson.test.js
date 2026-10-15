'use strict';

/**
 * docs/mrb-2336 hostile pin for FR-248 ebay customid / fr039 + fr106/108 lesson.
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
  'FR-248 ebay tenantParam is customid: update fr039 hostile userId= pins when CI fails; flip fr106/108 stay-dark after FR-179 enable';

describe('docs/mrb-2336 hostile FR-248 ebay customid lesson', () => {
  it('SKILL.md contiguous FR-248 customid + fr039 + fr106/108 lesson', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(LESSON), 'full lesson present');
    const line = text.split(/\r?\n/).find((l) => l.includes('FR-248 ebay tenantParam is customid'));
    assert.ok(line, 'lesson line present');
    assert.equal(line.includes('\u2014'), false, 'no em-dash');
    assert.equal(line.includes('\u2013'), false, 'no en-dash');
  });
});
