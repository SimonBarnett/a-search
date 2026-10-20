'use strict';

/**
 * Hostile pin for MRB #4757 / FR #4756: CJ non-alnum keyword-cap harvest
 * lesson must stay pure ASCII (FR #4197) -- em dash from #4754 broke main CI.
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

describe('docs/mrb-4757 CJ keyword-cap lesson ASCII (FR #4197)', () => {
  it('761-14 lesson line is contiguous ASCII with -- not U+2014', () => {
    const raw = fs.readFileSync(SKILL);
    assert.notEqual(raw[0], 0xef, 'no UTF-8 BOM');
    assert.ok(!raw.includes(Buffer.from([0xe2, 0x80, 0x94])), 'no UTF-8 em dash bytes');
    const src = raw.toString('utf8');
    const line = src
      .split(/\r?\n/)
      .find((l) => l.includes('761-14') && l.includes('non-alphanumeric'));
    assert.ok(line, 'CJ non-alnum keyword-cap lesson present');
    assert.match(line, /not whitespace alone -- a space-only/);
    assert.equal(line.includes('\u2014'), false);
    for (const ch of line) {
      assert.ok(ch.charCodeAt(0) < 128, `non-ASCII: U+${ch.charCodeAt(0).toString(16)}`);
    }
  });

  it('whole harvest-agent-skills SKILL.md stays ASCII (FR #4197 class)', () => {
    const text = fs.readFileSync(SKILL, 'utf8');
    for (let i = 0; i < text.length; i += 1) {
      assert.ok(
        text.charCodeAt(i) < 128,
        `non-ASCII at ${i}: U+${text.charCodeAt(i).toString(16)}`,
      );
    }
  });

  it('this pin file ends with a trailing newline', () => {
    const self = fs.readFileSync(__filename);
    assert.ok(self.length > 0 && self[self.length - 1] === 0x0a);
  });
});
