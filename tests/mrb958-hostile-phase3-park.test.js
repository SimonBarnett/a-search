'use strict';

/**
 * MRB #958 hostile pins: Phase-3 park mirrors (Refs #950-#956) + FR-121 LOCKED decision.
 * Park mirrors only; FR-121 implement PR locks environments.md sandbox to separate DB.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.equal(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, false, rel + ' must be UTF-8 no BOM');
  const text = buf.toString('utf8');
  assert.equal(/â€|Ã.|Â.|â†/.test(text), false, rel + ' must not contain mojibake');
  return text;
}

describe('MRB-958 Phase-3 park hostile', () => {
  it('park umbrella + gap + PHASE3-README exist and map FR-121..127 to #950-#956', () => {
    const umbrella = read('docs/feature-request-phase3-unlock-2026-10-09.md');
    assert.match(umbrella, /Phase 3/);
    assert.match(umbrella, /FR-121/);
    assert.match(umbrella, /FR-127/);
    assert.match(umbrella, /Refs.*not Closes|Park docs with \*\*Refs\*\*/i);

    const gap = read('docs/gap-analysis-phase3-2026-10-09.md');
    assert.match(gap, /#950-#956/);
    assert.match(gap, /FR-121/);

    const index = read('docs/fr/PHASE3-README.md');
    assert.match(index, /FR-121[\s\S]{0,40}#950/);
    assert.match(index, /FR-127[\s\S]{0,40}#956/);
  });

  it('FR-121..127 mirror files exist with Goal/Deliverables/Testable shape', () => {
    for (let n = 121; n <= 127; n += 1) {
      const text = read(`docs/fr/FR-${n}.md`);
      assert.match(text, new RegExp(`FR-${n}`));
      assert.match(text, /## Goal/);
      assert.match(text, /## Deliverables/);
      assert.match(text, /## Testable/);
      assert.match(text, /## Out of scope/);
    }
  });

  it('FR-121 records LOCKED separate-DB decision; rejects schema-in-madeiradb and read-only live as chosen', () => {
    const text = read('docs/fr/FR-121.md');
    assert.match(text, /Decision \(LOCKED 2026-10-09\)/);
    assert.match(text, /separate database on the same instance/i);
    assert.match(text, /Live:\s*`madeiradb`/);
    assert.match(text, /Rejected for this FR:[\s\S]{0,120}schema inside `madeiradb`/);
    assert.match(text, /Rejected for this FR:[\s\S]{0,200}live read-only/);
    assert.match(text, /issues\/950/);
  });

  it('P3-S1 umbrella success row pins separate database on the same instance', () => {
    const umbrella = read('docs/feature-request-phase3-unlock-2026-10-09.md');
    assert.match(
      umbrella,
      /P3-S1[\s\S]{0,200}separate database on the same instance/,
    );
  });
});
