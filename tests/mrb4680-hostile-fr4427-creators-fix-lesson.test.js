'use strict';

/**
 * docs/mrb-4680: hostile pin for fr4427 + Creators-default FIX harvest lesson
 * (PR #4680 / FR #4562).
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

describe('MRB #4680 hostile fr4427 Creators-default FIX lesson', () => {
  it('Harvested lessons keep contiguous fr4427 paapi_non_json complete tip', () => {
    const text = fs.readFileSync(skill, 'utf8');
    const needle =
      'a-search FIX after Creators default: fr4427 must expect handleSqsWith429 complete on paapi_non_json';
    const i = text.indexOf(needle);
    assert.ok(i >= 0, 'missing fr4427 Creators-default FIX lesson');
    const window = text.slice(i, i + 300);
    assert.match(window, /not reject\+backoff/);
    assert.match(window, /plain 503/);
    assert.match(window, /stays transient/);
    assert.match(window, /AMAZON_SEARCH_API=paapi/);
    assert.match(window, /PA-API unit envs/);
    assert.doesNotMatch(window, /\u2014/);
    const raw = fs.readFileSync(skill);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
  });
});
