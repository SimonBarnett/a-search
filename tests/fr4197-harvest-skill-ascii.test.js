'use strict';

/**
 * FR #4197: harvest-agent-skills SKILL.md must stay pure ASCII so mrb1172
 * (whole-file em/en-dash / mojibake gate) and main CI stay green.
 * Wix filesusr lesson: hyphen->dot (never UTF-8 arrow mojibake).
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

const WIX_NEEDLE =
  'Wix HTML embeds Origin as {dots-as-hyphens}.filesusr.com --- decode by hyphen->dot';

describe('FR #4197 harvest-agent-skills SKILL.md ASCII', () => {
  it('SKILL.md has no BOM and no non-ASCII bytes', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    for (let i = 0; i < buf.length; i++) {
      assert.ok(
        buf[i] < 128,
        'non-ASCII byte at ' + i + ' (0x' + buf[i].toString(16) + ')',
      );
    }
  });

  it('Wix filesusr lesson uses ASCII hyphen->dot', () => {
    const text = fs.readFileSync(SKILL, 'utf8');
    assert.ok(text.includes(WIX_NEEDLE), 'Wix filesusr contiguous ASCII needle');
    assert.equal(text.includes('\u00e2'), false, 'no mojibake Latin-1 a-circumflex');
    assert.equal(text.includes('\u2014'), false, 'no em-dash');
    assert.equal(text.includes('\u2013'), false, 'no en-dash');
    assert.equal(text.includes('\u2192'), false, 'no Unicode right-arrow');
  });
});
