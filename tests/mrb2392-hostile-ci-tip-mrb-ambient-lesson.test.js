'use strict';

/**
 * docs/mrb-2392 hostile pin: CI tip MRB ambient fr106/108 ACCEPTABLE + FR #3948.
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
  'a-search CI tip MRB: confirm runner labels hit whiterabbit and job id stays test-and-synth; ambient fr106/108 wix red is ACCEPTABLE (#2335) not a FAIL of the runner tip; re-arm --auto --squash without CI poll (FR #3948)';

describe('docs/mrb-2392 hostile CI tip MRB ambient stay-dark lesson', () => {
  it('SKILL.md contiguous CI tip MRB whiterabbit + ambient ACCEPTABLE lesson', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(LESSON), 'full lesson present');
    const line = text.split(/\r?\n/).find((l) => l.includes('CI tip MRB: confirm runner labels'));
    assert.ok(line, 'lesson line present');
    assert.equal(line.includes('\u2014'), false, 'no em-dash');
    assert.equal(line.includes('\u2013'), false, 'no en-dash');
  });
});
