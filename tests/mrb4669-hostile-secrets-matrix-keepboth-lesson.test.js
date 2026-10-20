'use strict';

/**
 * docs/mrb-4669: hostile pin for harvest tip on keep-both secrets-matrix
 * after sibling creators-credential land (PR #4669).
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

describe('MRB #4669 hostile secrets-matrix keep-both FIX lesson', () => {
  it('Harvested lessons keep contiguous CONFLICTING secrets-matrix keep-both tip', () => {
    const text = fs.readFileSync(skill, 'utf8');
    const needle =
      'a-search FIX when tip CONFLICTING on secrets-matrix after sibling creators-credential land';
    const i = text.indexOf(needle);
    assert.ok(i >= 0, 'missing secrets-matrix keep-both FIX lesson');
    const window = text.slice(i, i + 280);
    assert.match(window, /keep-both/);
    assert.match(window, /FR #4650/);
    assert.match(window, /soft-deploy/);
    assert.match(window, /creators-credential/);
    assert.match(window, /DONE FIX/);
    assert.match(window, /no CI poll/);
    assert.doesNotMatch(window, /\u2014/);
    const raw = fs.readFileSync(skill);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
  });
});
