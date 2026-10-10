'use strict';

/**
 * FR-166: Phase-4 enablement index + credential gate; no enabled flips.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const docRel = path.join('docs', 'phase4-enablement-index.md');
const registryPath = path.join(root, 'providers', 'registry.json');

/** Remaining Phase-2 stay-dark ids after FR-167 kijiji + FR-169 aliexpress. */
const PHASE2_STUB_IDS = [
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
];

/** Index still lists every FR-167..180 id (including already-enabled kelkoo). */
const ENABLE_FR_BY_ID = {
  kelkoo: 'FR-167',
  skimlinks: 'FR-168',
  aliexpress: 'FR-169',
  etsy: 'FR-170',
  bol: 'FR-171',
  partnerize: 'FR-172',
  webgains: 'FR-173',
  tradedoubler: 'FR-174',
  admitad: 'FR-175',
  flexoffers: 'FR-176',
  avantlink: 'FR-177',
  shopify: 'FR-178',
  wix: 'FR-179',
  woocommerce: 'FR-180',
};

function readUtf8(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.ok(
    !(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf),
    `${rel} must be UTF-8 without BOM`,
  );
  return buf.toString('utf8');
}

function assertAscii(text, label) {
  assert.ok(
    !/[^\x09\x0A\x0D\x20-\x7E]/.test(text),
    `${label} must be ASCII`,
  );
}

describe('FR-166 phase4 enablement index + stay-dark pin', () => {
  it('docs/phase4-enablement-index.md has index + credential-gate needles', () => {
    assert.ok(
      fs.existsSync(path.join(root, docRel)),
      'missing docs/phase4-enablement-index.md',
    );
    const text = readUtf8(docRel);
    assertAscii(text, docRel);
    assert.match(text, /FR-166/);
    assert.match(text, /FR-126|phase3-enable-provider/);
    assert.match(text, /credential-gate|Credential-gate/i);
    assert.match(text, /Secrets Manager|secret/i);
    assert.match(text, /selftest/i);
    assert.match(text, /bulk|one id|one.?provider/i);
    assert.match(
      text,
      /does\s+\*{0,2}not\*{0,2}\s+flip|Do \*\*not\*\* flip|does not flip/i,
    );
    assert.match(text, /ISSUED-PHASE4/);
    for (const id of Object.keys(ENABLE_FR_BY_ID)) {
      assert.match(text, new RegExp(`\`${id}\`|\\b${id}\\b`));
      assert.match(text, new RegExp(ENABLE_FR_BY_ID[id]));
    }
    assert.match(text, /FR-181|Creators/);
    assert.match(text, /FR-186|WAF/);
    assert.match(text, /FR-190|Multi-region|multi-region/);
  });

  it('README + phase3-enable-provider point at the index', () => {
    const readme = readUtf8('README.md');
    assert.match(readme, /docs\/phase4-enablement-index\.md/);

    const phase3 = readUtf8('docs/phase3-enable-provider.md');
    assert.match(phase3, /phase4-enablement-index\.md|FR-166/);
  });

  it('FR-166 Decision LOCKED', () => {
    const fr = readUtf8(path.join('docs', 'fr', 'FR-166.md'));
    assertAscii(fr, 'docs/fr/FR-166.md');
    assert.match(fr, /Decision\s*\(?\s*LOCKED\)?/i);
    assert.match(fr, /fr166-phase4-enablement-index\.test\.js/);
    assert.match(fr, /phase4-enablement-index\.md/);
  });

  it('registry: remaining stay-dark stubs false; kelkoo+aliexpress enabled by FR-167/169', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    for (const id of PHASE2_STUB_IDS) {
      assert.ok(byId.has(id), `registry missing ${id}`);
      const en = byId.get(id).enabled;
      assert.equal(
        en.live,
        false,
        `${id}.enabled.live must stay false until its enable FR`,
      );
      assert.equal(
        en.sandbox,
        false,
        `${id}.enabled.sandbox must stay false until its enable FR`,
      );
    }
    // FR-167 may have enabled kelkoo; index FR never flips flags itself.
    assert.ok(byId.has('kelkoo'), 'registry missing kelkoo');
  });
});
