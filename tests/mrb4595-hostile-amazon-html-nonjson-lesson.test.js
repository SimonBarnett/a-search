'use strict';

/**
 * docs/mrb-4595: hostile pin for harvest-agent-skills Amazon PA-API HTML
 * non-JSON / Creators default lesson (PR #4595 / FR #4562).
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

describe('MRB #4595 hostile Amazon HTML non-JSON harvest lesson', () => {
  it('Harvested lessons keep contiguous paapi_non_json Creators-default tip', () => {
    const text = fs.readFileSync(skill, 'utf8');
    const needle =
      'Amazon PA-API HTML non-JSON (paapi_non_json/creators_non_json)';
    const i = text.indexOf(needle);
    assert.ok(i >= 0, 'missing Amazon HTML non-JSON lesson');
    const window = text.slice(i, i + 320);
    assert.match(window, /FR #4769 fail into DLQ/);
    assert.match(window, /no status IN/);
    assert.match(window, /AMAZON_SEARCH_API=creators/);
    assert.match(window, /explicit paapi/);
    assert.match(window, /fill-madeira Creators SSM/);
    assert.doesNotMatch(window, /\u2014/);
    const raw = fs.readFileSync(skill);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
  });
});
