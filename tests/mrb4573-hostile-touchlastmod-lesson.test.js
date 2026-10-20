'use strict';

/**
 * docs/mrb-4573: hostile pin for harvest-agent-skills best-effort touchLastmod
 * after IN putObject (PR #4573 / FR #4559).
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

describe('MRB #4573 hostile touchLastmod best-effort harvest lesson', () => {
  it('Harvested lessons keep contiguous best-effort touchLastmod tip', () => {
    const text = fs.readFileSync(skill, 'utf8');
    const needle =
      'After IN/ putObject, wrap touchLastmod in best-effort catch';
    const i = text.indexOf(needle);
    assert.ok(i >= 0, 'missing best-effort touchLastmod lesson');
    const window = text.slice(i, i + 320);
    assert.match(window, /CopyObject 403/);
    assert.match(window, /must not DLQ/);
    assert.match(window, /Get\/List ObjectAnnotation/);
    assert.match(window, /wireAclubsInAccess/);
    assert.match(window, /not Put\/Delete/);
    assert.doesNotMatch(window, /\u2014/);
    const raw = fs.readFileSync(skill);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
  });
});
