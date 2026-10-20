'use strict';

/**
 * docs/mrb-4569: hostile pin for harvest-agent-skills handleSqsWith429
 * missing_credentials lesson (PR #4569 / FR #4561).
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

describe('MRB #4569 hostile missing_credentials harvest lesson', () => {
  it('Harvested lessons keep contiguous handleSqsWith429 missing_credentials tip', () => {
    const text = fs.readFileSync(skill, 'utf8');
    const needle =
      'handleSqsWith429: *_missing_credentials must ERROR-log provider+searchid';
    const i = text.indexOf(needle);
    assert.ok(i >= 0, 'missing handleSqsWith429 missing_credentials lesson');
    const window = text.slice(i, i + 280);
    assert.match(window, /ERROR-log provider\+searchid/);
    assert.match(window, /products:\[\]/);
    assert.match(window, /error:missing_credentials/);
    assert.match(window, /ack\/delete/);
    assert.match(window, /never silent success/);
    assert.doesNotMatch(window, /\u2014/);
    const raw = fs.readFileSync(skill);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
  });
});
