'use strict';

/**
 * docs/mrb-2108: hostile pin for CONFLICTING harvest SKILL restore lesson.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(
  ROOT,
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

describe('docs/mrb-2108 harvest CONFLICTING SKILL restore', () => {
  it('pins contiguous checkout/cat-file + UTF8Encoding(false) + no git-show string', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'SKILL.md must be UTF-8 no BOM');
    const text = buf.toString('utf8');
    assert.match(
      text,
      /checkout origin\/main -- path OR git cat-file blob origin\/main:path bytes/,
    );
    assert.match(text, /UTF8Encoding\(false\) WriteAllText/);
    assert.match(text, /never assign git-show multiline to a PowerShell string/);
    assert.match(text, /mojibake on unicode arrows/);
  });
});