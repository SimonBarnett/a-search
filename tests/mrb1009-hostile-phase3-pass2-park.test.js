'use strict';

/**
 * MRB #1009 hostile pins: Phase-3 gap pass 2 park (Refs #994-#1008).
 * Does not close implementation issues.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.equal(
    buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
    false,
    `${rel} must be UTF-8 no BOM`,
  );
  const text = buf.toString('utf8');
  assert.equal(
    /â€|â€™|ï»¿|\uFFFD/.test(text),
    false,
    `${rel} must not contain mojibake`,
  );
  return text;
}

describe('MRB-1009 Phase-3 gap pass 2 park hostile', () => {
  it('gap + ISSUED-RELEASE-PASS2 map FR-151..165 to #994-#1008', () => {
    const gap = read('docs/release-gap-pass2-2026-10-09.md');
    assert.match(gap, /gap pass 2/i);
    assert.match(gap, /FR-151/);
    assert.match(gap, /FR-165/);
    assert.match(gap, /#994/);
    assert.match(gap, /#1008/);
    assert.match(gap, /Stay-dark|stay-dark/i);

    const index = read('docs/fr/ISSUED-RELEASE-PASS2.md');
    assert.match(index, /FR-151[\s\S]{0,80}#994/);
    assert.match(index, /FR-165[\s\S]{0,80}#1008/);
  });

  it('FR-151..165 mirrors have Goal/Deliverables/Testable/Out of scope', () => {
    for (let n = 151; n <= 165; n += 1) {
      const text = read(`docs/fr/FR-${n}.md`);
      assert.match(text, new RegExp(`FR-${n}`));
      assert.match(text, /## Goal/);
      assert.match(text, /## Deliverables/);
      assert.match(text, /## Testable/);
      assert.match(text, /## Out of scope/);
    }
  });

  it('park docs do not Closes #994-#1008', () => {
    const gap = read('docs/release-gap-pass2-2026-10-09.md');
    assert.doesNotMatch(gap, /Closes\s+#99[4-9]|Closes\s+#100[0-8]/i);
    const index = read('docs/fr/ISSUED-RELEASE-PASS2.md');
    assert.doesNotMatch(index, /Closes\s+#99|Closes\s+#100/i);
  });
});
