'use strict';

/**
 * docs/mrb-4614: hostile pin for harvest-agent-skills root VISION.md pointer
 * lesson (PR #4614 / FR #4572).
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

describe('MRB #4614 hostile root VISION.md harvest lesson', () => {
  it('Harvested lessons keep contiguous docs/vision.md + root VISION.md tip', () => {
    const text = fs.readFileSync(skill, 'utf8');
    const needle =
      'a-search: keep canonical LOCKED pack at docs/vision.md';
    const i = text.indexOf(needle);
    assert.ok(i >= 0, 'missing root VISION.md pointer lesson');
    const window = text.slice(i, i + 280);
    assert.match(window, /docs\/vision\.md/);
    assert.match(window, /root VISION\.md/);
    assert.match(window, /MRB seats/);
    assert.match(window, /IN\/a-clubs\/DLQ/);
    assert.doesNotMatch(window, /\u2014/);
    const raw = fs.readFileSync(skill);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
  });
});
