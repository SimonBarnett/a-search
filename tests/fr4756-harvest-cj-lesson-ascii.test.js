'use strict';

/**
 * FR #4756: harvest-agent-skills CJ keyword-cap lesson must stay ASCII (FR #4197).
 * Em dash from #4754 broke main CI.
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

describe('FR #4756 harvest CJ keyword lesson ASCII', () => {
  it('SKILL.md has no BOM and no non-ASCII bytes', () => {
    const raw = fs.readFileSync(SKILL);
    assert.notEqual(raw[0], 0xef, 'no UTF-8 BOM');
    const text = raw.toString('utf8');
    for (let i = 0; i < text.length; i += 1) {
      assert.ok(
        text.charCodeAt(i) < 128,
        `non-ASCII at ${i}: U+${text.charCodeAt(i).toString(16)}`,
      );
    }
  });

  it('CJ non-alnum keyword-cap lesson uses ASCII hyphen/dash only', () => {
    const text = fs.readFileSync(SKILL, 'utf8');
    const line = text
      .split(/\r?\n/)
      .find((l) => l.includes('761-14') && l.includes('non-alphanumeric'));
    assert.ok(line, 'CJ keyword-cap lesson line present');
    assert.match(line, /not whitespace alone -- a space-only|not whitespace alone - a space-only/);
    assert.equal(line.includes('\u2014'), false);
    assert.match(line, /HTTP 400/);
  });
});
