'use strict';

/**
 * docs/mrb-4677: hostile pin for Amazon Creators default + FR-045 LOCKED
 * harvest lesson (PR #4677 / FR #4562).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skill = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

describe('MRB #4677 hostile Amazon Creators default + FR-045 lesson', () => {
  it('Harvested lessons keep contiguous Creators default / FR-045 LOCKED tip', () => {
    const text = fs.readFileSync(skill, 'utf8');
    const needle = 'Amazon deploy default Creators; paapi_non_json/creators_non_json';
    const i = text.indexOf(needle);
    assert.ok(i >= 0, 'missing Amazon Creators default lesson');
    const window = text.slice(i, i + 280);
    assert.match(window, /write status IN/);
    assert.match(window, /complete SQS/);
    assert.match(window, /not transient/);
    assert.match(window, /FR-045 LOCKED/);
    assert.match(window, /PA-API SearchItems/);
    assert.doesNotMatch(window, /\u2014/);
    const raw = fs.readFileSync(skill);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
  });
});
