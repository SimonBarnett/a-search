'use strict';

/**
 * FR-2746: harvest-agent-skills SKILL.md GitGuardian placeholders must be pure ASCII.
 * Pin AKIA...EXAMPLE (no mojibake ellipsis) so double-encoding cannot return.
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

describe('FR-2746 harvest SKILL GitGuardian AKIA ASCII', () => {
  it('SKILL.md is UTF-8 no BOM and pins AKIA...EXAMPLE as pure ASCII', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'SKILL.md must be UTF-8 no BOM');
    const text = buf.toString('utf8');
    assert.match(
      text,
      /Obvious placeholders \(`FAKE_`, `EXAMPLE`, AWS doc `AKIA\.\.\.EXAMPLE`\) are fine/,
    );
    const m = text.match(/AWS doc `AKIA([\s\S]*?)EXAMPLE`/);
    assert.ok(m, 'must contain AWS doc `AKIA...EXAMPLE`');
    for (let i = 0; i < m[1].length; i++) {
      const c = m[1].charCodeAt(i);
      assert.ok(
        c < 128,
        `non-ASCII U+${c.toString(16)} between AKIA and EXAMPLE at offset ${i}`,
      );
    }
    assert.equal(m[1], '...', 'ellipsis between AKIA and EXAMPLE must be three ASCII dots');
  });
});