'use strict';

/**
 * docs/mrb-5252: pin harvest-agent-skills — VISION.md DLQ parentheticals stay
 * stale after handler FR until a follow-up pin forbids the old code list.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skillPath = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

function skillText() {
  return fs.readFileSync(skillPath, 'utf8').replace(/^\uFEFF/, '');
}

describe('docs/mrb-5252 VISION DLQ parentheticals stale after handler', () => {
  it('pins handler FR then follow-up pin forbids old code list', () => {
    const t = skillText();
    assert.match(t, /After a handler FR lands/);
    assert.match(t, /root VISION\.md DLQ parentheticals stay stale/);
    assert.match(t, /follow-up pin forbids the old code list/);
    assert.match(
      t,
      /After a handler FR lands[\s\S]{0,160}forbids the old code list/,
    );
  });
});