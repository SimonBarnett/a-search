'use strict';

/** docs/mrb-1071: hostile pins for FR-126 phase3 enable-provider template (PR #1071). */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const doc = path.join(root, 'docs', 'phase3-enable-provider.md');
const registryPath = path.join(root, 'providers', 'registry.json');
const productTest = path.join(
  root,
  'tests',
  'fr126-phase3-enable-provider-docs.test.js',
);

/** Remaining stay-dark stubs (skimlinks enabled by FR-168). */
const PHASE2_STUB_IDS = [
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

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('MRB #1071 hostile FR-126 enable-provider template', () => {
  it('template CAST IRON: not enable anyone; one id; no secrets; local DDL/Parts order', () => {
    const t = read('docs/phase3-enable-provider.md');
    assert.match(t, /FR-126/);
    assert.match(t, /does \*\*not\*\* enable|does not enable/i);
    assert.match(t, /exactly one|one id|Flip only that id/i);
    assert.match(t, /never commit secrets|not\s+git/i);
    assert.match(t, /DDL/);
    assert.match(t, /Parts/);
    assert.match(t, /least-privilege|#951|FR-122/);
    assert.match(t, /#1011|#1013/);
  });

  it('registry on main still keeps all Phase-2 stubs dark after FR-126 merge', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    for (const id of PHASE2_STUB_IDS) {
      assert.ok(byId.has(id), `missing ${id}`);
      assert.equal(byId.get(id).enabled.live, false, `${id}.live`);
      assert.equal(byId.get(id).enabled.sandbox, false, `${id}.sandbox`);
    }
  });

  it('product fr126 pin + FR-126 park Decision LOCKED remain on main', () => {
    assert.ok(fs.existsSync(productTest));
    const pt = fs.readFileSync(productTest, 'utf8');
    assert.match(pt, /PHASE2_STUB_IDS|phase3-enable-provider/);
    assert.match(pt, /must stay false|enabled\.live must stay false/);
    const park = read('docs/fr/FR-126.md');
    assert.match(park, /Decision \(LOCKED\)/);
    assert.match(park, /flips nobody|Do \*\*not\*\* enable/i);
  });

  it('phase2-providers + shortlist + README still link the template', () => {
    for (const rel of [
      'docs/phase2-providers.md',
      'docs/provider-shortlist.md',
      'README.md',
    ]) {
      assert.match(
        read(rel),
        /phase3-enable-provider\.md/,
        `${rel} missing template link`,
      );
    }
  });
});
