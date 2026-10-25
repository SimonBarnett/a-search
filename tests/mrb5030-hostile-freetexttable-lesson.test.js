'use strict';

/**
 * MRB #5030: hostile pin --- Walrus Parts FREETEXTTABLE harvest lesson.
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

const NEEDLE =
  'Walrus Parts full-text: FREETEXTTABLE ranked match; bind NVarChar(4000) not nvarchar(max); keep multi-word excludes as one quoted CONTAINS phrase.';

describe('MRB #5030 hostile FREETEXTTABLE harvest lesson', () => {
  it('SKILL.md UTF-8 no-BOM pure ASCII', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    for (let i = 0; i < buf.length; i++) {
      assert.ok(buf[i] < 128, 'non-ASCII at ' + i);
    }
  });

  it('pins contiguous FREETEXTTABLE / NVarChar(4000) lesson', () => {
    const text = fs.readFileSync(SKILL, 'utf8');
    assert.ok(text.includes(NEEDLE), 'contiguous FREETEXTTABLE needle');
    assert.match(text, /FREETEXTTABLE ranked match/);
    assert.match(text, /NVarChar\(4000\)/);
    assert.equal(text.includes('\u2014'), false, 'no em-dash');
  });
});
