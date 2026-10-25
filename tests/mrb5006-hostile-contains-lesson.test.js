'use strict';

/**
 * MRB #5006: hostile pin for SQL CONTAINS sanitise harvest lesson.
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
  'a-search SQL CONTAINS: strip punctuation and operators, drop English noise words, quote remaining tokens (OR includes, AND NOT excludes). Severity < 11 including noise-word notices is 0 rows. Real errors log number, message, and sanitised contains --- never bare EREQUEST. GRANT SELECT ON dbo.Parts only for WONDERLAND\\a-search-drain.';

describe('MRB #5006 hostile SQL CONTAINS lesson', () => {
  it('SKILL.md UTF-8 no-BOM pure ASCII', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    for (let i = 0; i < buf.length; i++) {
      assert.ok(buf[i] < 128, 'non-ASCII at ' + i);
    }
  });

  it('pins contiguous CONTAINS sanitise lesson', () => {
    const text = fs.readFileSync(SKILL, 'utf8');
    assert.ok(text.includes(NEEDLE), 'contiguous CONTAINS lesson needle');
    assert.ok(text.includes('never bare EREQUEST'));
    assert.ok(text.includes('GRANT SELECT ON dbo.Parts'));
    assert.equal(text.includes('\u2014'), false, 'no em-dash');
  });
});
