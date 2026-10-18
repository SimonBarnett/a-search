'use strict';

/**
 * MRB #3633 hostile: FR-3611 CRLF-safe skill pins export and wire.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const {
  normalizeNewlines,
  assertSkillIncludes,
} = require('./helpers/skillText');

describe('mrb3633 hostile: FR-3611 CRLF skill helper', () => {
  it('normalizeNewlines strips CR so CRLF fixtures match LF needles', () => {
    assert.equal(normalizeNewlines('a\r\nb\r\n'), 'a\nb\n');
    assert.equal(normalizeNewlines('a\nb\n'), 'a\nb\n');
  });

  it('assertSkillIncludes finds a bullet in a CRLF skill file', () => {
    const needle = '- FR #3611: skill pins must tolerate CRLF';
    const tmp = path.join(ROOT, 'tests', 'fixtures', 'fr3611-crlf-skill-tmp.md');
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, `x\r\n${needle}\r\ny\r\n`, 'utf8');
    try {
      assertSkillIncludes(tmp, needle);
      assert.throws(() => assertSkillIncludes(tmp, '- missing bullet'), /missing needle/i);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('mrb3609 pin requires skillText helper (not bare assert.match with \\\\n)', () => {
    const text = fs.readFileSync(
      path.join(ROOT, 'tests/mrb3609-hostile-fr3478-wix-env-lesson.test.js'),
      'utf8',
    );
    assert.match(text, /skillText|assertSkillIncludes|normalizeNewlines/);
    assert.equal(/assert\.match\([^)]*\\\\n/.test(text), false);
  });
});
