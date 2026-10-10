'use strict';

/**
 * MRB #1042 hostile pins: Phase-4 park (enable/Creators/WAF/multi-region FR-166..194).
 * Refs #1011 #1013 #1015-#1041 — does not close implementation issues.
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

describe('MRB-1042 Phase-4 park hostile', () => {
  it('umbrella + ISSUED-PHASE4 map FR-166..194 to #1011/#1013/#1015-#1041', () => {
    const umbrella = read(
      'docs/feature-request-phase4-enable-creators-waf-multiregion-2026-10-09.md',
    );
    assert.match(umbrella, /Phase 4/);
    assert.match(umbrella, /FR-166/);
    assert.match(umbrella, /FR-190\.\.194|FR-194/);
    assert.match(umbrella, /#1011/);
    assert.match(umbrella, /#1041/);
    assert.match(umbrella, /Creators|WAF|Multi-region/i);
    assert.match(umbrella, /no bulk flip|One-id enable/i);

    const index = read('docs/fr/ISSUED-PHASE4.md');
    assert.match(index, /FR-166[\s\S]{0,80}#1011/);
    assert.match(index, /FR-194[\s\S]{0,80}#1041/);
    assert.match(index, /FR-186[\s\S]{0,120}WAFv2/);

    const tsv = read('docs/fr/ISSUED-PHASE4.tsv');
    assert.match(tsv, /FR-166/);
    assert.match(tsv, /FR-194/);
  });

  it('FR-166..194 mirror files exist with Goal/Deliverables/Testable shape', () => {
    for (let n = 166; n <= 194; n += 1) {
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
      'docs/feature-request-phase4-enable-creators-waf-multiregion-2026-10-09.md',
    );
    assert.doesNotMatch(umbrella, /Closes\s+#10(1[1-9]|2\d|3\d|4[01])/i);
    const index = read('docs/fr/ISSUED-PHASE4.md');
    assert.doesNotMatch(index, /Closes\s+#10/i);

    const reg = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const byId = Object.fromEntries(reg.sources.map((s) => [s.id, s]));
    // Remaining Phase-2 stay-dark after FR-169 enabled aliexpress.
    for (const id of [
      'kelkoo',
      'skimlinks',
      'etsy',
      'bol',
      'partnerize',
      'webgains',
      'tradedoubler',
      'admitad',
      'flexoffers',
      'avantlink',
      'shopify',
      'wix',
      'woocommerce',
    ]) {
      assert.ok(byId[id], `missing registry id ${id}`);
      assert.equal(byId[id].enabled.live, false, `${id} must stay dark`);
    }
    assert.equal(byId.amazon.enabled.live, true);
    assert.equal(byId.aliexpress.enabled.live, true, 'FR-169 enables aliexpress');
  });
});
