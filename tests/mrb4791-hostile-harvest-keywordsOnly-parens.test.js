'use strict';

/**
 * docs/mrb-4791: pin harvest lesson for keywordsOnly short product parentheticals.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

describe('docs/mrb-4791 harvest keywordsOnly product parens lesson', () => {
  it('pins contiguous RTF/BNF parenthetical playbook', () => {
    const text = fs.readFileSync(SKILL, 'utf8');
    assert.match(
      text,
      /keywordsOnly: expand short product codes in parentheses \(RTF\/BNF\) and only drop location-like parentheticals/,
    );
  });
});
