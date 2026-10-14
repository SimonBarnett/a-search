'use strict';

/**
 * FR-190 / #1037: multi-region strategy docs lock (active-passive).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function utf8NoBom(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.notEqual(buf[0], 0xef, `${rel} must be UTF-8 without BOM`);
  const text = buf.toString('utf8');
  for (let i = 0; i < text.length; i += 1) {
    assert.ok(
      text.charCodeAt(i) < 128,
      `${rel} non-ASCII at ${i}: U+${text.charCodeAt(i).toString(16)}`,
    );
  }
  return text;
}

describe('FR-190 multi-region strategy docs', () => {
  it('multi-region.md Decision LOCKED active-passive + eu-west-2 + SQL single-region', () => {
    const text = utf8NoBom('docs/multi-region.md');
    assert.match(text, /Decision \(LOCKED\)/);
    assert.match(text, /[Aa]ctive-passive/);
    assert.match(text, /eu-west-2/);
    assert.match(text, /single-region/);
    assert.match(text, /IONOS|madeiradb/);
    assert.doesNotMatch(text, /LOCK(?:ED)?\s+active-active/i);
  });

  it('FR-190.md Decision LOCKED points at multi-region.md', () => {
    const fr = utf8NoBom('docs/fr/FR-190.md');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /active-passive/);
    assert.match(fr, /eu-west-2/);
    assert.match(fr, /multi-region\.md/);
  });

  it('Success table needles present', () => {
    const text = utf8NoBom('docs/multi-region.md');
    assert.match(text, /Success/);
    assert.match(text, /M1/);
  });
});
