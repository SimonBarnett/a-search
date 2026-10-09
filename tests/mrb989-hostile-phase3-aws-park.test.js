'use strict';

/**
 * MRB #989 hostile pins: Phase-3 AWS installable park (Refs #964-#986).
 * Does not close implementation issues. Tip BOM hygiene fixed on this docs/mrb.
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

describe('MRB-989 Phase-3 AWS installable park hostile', () => {
  it('umbrella + release-gap + ISSUED-RELEASE map FR-128..150 to #964-#986', () => {
    const umbrella = read(
      'docs/feature-request-phase3-aws-installable-2026-10-09.md',
    );
    assert.match(umbrella, /AWS installable/i);
    assert.match(umbrella, /FR-128/);
    assert.match(umbrella, /FR-150/);
    assert.match(umbrella, /#950|#956|unlock/i);
    assert.match(umbrella, /Stay-dark|enabled=false/i);

    const gap = read('docs/release-gap-aws-installable-2026-10-09.md');
    assert.match(gap, /FR-128|installable/i);

    const index = read('docs/fr/ISSUED-RELEASE.md');
    assert.match(index, /FR-128[\s\S]{0,80}#964/);
    assert.match(index, /FR-150[\s\S]{0,80}#986/);
    assert.match(index, /#950|#956/);
  });

  it('FR-128..150 mirror files exist with Goal/Deliverables/Testable shape', () => {
    for (let n = 128; n <= 150; n += 1) {
      const text = read(`docs/fr/FR-${n}.md`);
      assert.match(text, new RegExp(`FR-${n}`));
      assert.match(text, /## Goal/);
      assert.match(text, /## Deliverables/);
      assert.match(text, /## Testable/);
      assert.match(text, /## Out of scope/);
    }
  });

  it('park docs do not Closes implementation issues; stay-dark ids remain off', () => {
    const umbrella = read(
      'docs/feature-request-phase3-aws-installable-2026-10-09.md',
    );
    assert.doesNotMatch(umbrella, /Closes\s+#96[4-9]|Closes\s+#98[0-6]/i);
    assert.match(umbrella, /Enabling stay-dark|stay-dark/i);
    const index = read('docs/fr/ISSUED-RELEASE.md');
    assert.doesNotMatch(index, /Closes\s+#96/i);
    // Docs-only park must not have flipped stay-dark registry rows.
    const reg = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const byId = Object.fromEntries(reg.sources.map((s) => [s.id, s]));
    assert.equal(byId.tradedoubler.enabled.live, false);
    assert.equal(byId.partnerize.enabled.live, false);
    assert.equal(byId.amazon.enabled.live, true);
  });
});

