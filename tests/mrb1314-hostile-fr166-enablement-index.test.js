'use strict';

/** Hostile pins for MRB #1314 / FR-166 Phase-4 enablement index (stay-dark). */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const doc = path.join(root, 'docs', 'phase4-enablement-index.md');
const fr = path.join(root, 'docs', 'fr', 'FR-166.md');
const pin = path.join(root, 'tests', 'fr166-phase4-enablement-index.test.js');
const registryPath = path.join(root, 'providers', 'registry.json');

/** Remaining stay-dark after FR-169 (aliexpress enabled separately). */
const PHASE2_STUB_IDS = [
  'kelkoo', 'skimlinks', 'etsy', 'bol', 'partnerize', 'webgains',
  'tradedoubler', 'admitad', 'flexoffers', 'avantlink', 'shopify', 'wix', 'woocommerce',
];

describe('MRB-1314 hostile FR-166 phase4 enablement index', () => {
  it('index + Decision LOCKED + product pin present', () => {
    const text = fs.readFileSync(doc, 'utf8');
    assert.ok(text.includes('Phase-4 stay-dark enablement index'));
    assert.ok(text.includes('credential-gate checklist'));
    assert.ok(text.includes('FR-167'));
    assert.ok(text.includes('FR-180'));
    assert.ok(text.includes('does **not** flip any `enabled` flag') || text.includes('does not flip any'));
    assert.ok(!text.startsWith('\uFEFF'));

    const frText = fs.readFileSync(fr, 'utf8');
    assert.match(frText, /Decision\s*\(?\s*LOCKED\)?/i);
    assert.ok(frText.includes('fr166-phase4-enablement-index.test.js'));
    assert.ok(fs.existsSync(pin), 'missing tests/fr166-phase4-enablement-index.test.js');
  });

  it('registry Phase-2 stubs remain enabled false', () => {
    const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const rows = Array.isArray(reg) ? reg : reg.providers || reg.sources || [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of PHASE2_STUB_IDS) {
      assert.ok(byId.has(id), `missing registry id ${id}`);
      const en = byId.get(id).enabled || {};
      assert.equal(en.live, false, `${id}.enabled.live`);
      assert.equal(en.sandbox, false, `${id}.enabled.sandbox`);
    }
  });
});
