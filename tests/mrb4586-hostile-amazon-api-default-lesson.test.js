'use strict';

/**
 * docs/mrb-4586: hostile pin for harvest-agent-skills provider API default flip
 * (AMAZON_SEARCH_API=paapi + vendor_non_json) from PR #4586 / FR #4562.
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

describe('MRB #4586 hostile AMAZON_SEARCH_API default-flip harvest lesson', () => {
  it('Harvested lessons keep contiguous provider API default-flip tip', () => {
    const text = fs.readFileSync(skill, 'utf8');
    const needle =
      'When flipping a provider API default, pin AMAZON_SEARCH_API=paapi';
    const i = text.indexOf(needle);
    assert.ok(i >= 0, 'missing provider API default-flip lesson');
    const window = text.slice(i, i + 320);
    assert.match(window, /AMAZON_SEARCH_API=paapi/);
    assert.match(window, /legacy unit env/);
    assert.match(window, /isTransientVendorHttp/);
    assert.match(window, /vendor_non_json/);
    assert.match(window, /FR #4769/);
    assert.match(window, /DLQ/);
    assert.doesNotMatch(window, /\u2014/);
    const raw = fs.readFileSync(skill);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
  });
});
