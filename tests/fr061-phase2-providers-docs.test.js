'use strict';

/**
 * FR-061: docs/phase2-providers.md stay-dark rule + registry pins.
 * Phase-2 stub ids stay enabled.live/sandbox false until credentials exist.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const doc = path.join(root, 'docs', 'phase2-providers.md');
const registryPath = path.join(root, 'providers', 'registry.json');

/** Providers still stubbed / awaiting account details (etsy enabled by FR-170). */
const PHASE2_STUB_IDS = [
  'kelkoo',
  'skimlinks',
  'aliexpress',
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

describe('FR-061 Phase-2 provider docs + stay-dark', () => {
  it('docs/phase2-providers.md states stay-dark until credentials', () => {
    assert.ok(fs.existsSync(doc), 'missing docs/phase2-providers.md');
    const text = fs.readFileSync(doc, 'utf8');
    assert.match(text, /Phase-?2/i);
    assert.match(text, /stay-?dark|enabled\.live\s*=\s*false|enabled.*false/i);
    assert.match(text, /credential|account details/i);
    assert.match(text, /fixture/i);
    assert.match(text, /CAST IRON/i);
    for (const id of PHASE2_STUB_IDS) {
      assert.match(text, new RegExp(`\\b${id}\\b`), `doc lists ${id}`);
    }
  });

  it('provider-shortlist.md and README point at phase2-providers.md', () => {
    const shortlist = fs.readFileSync(
      path.join(root, 'docs', 'provider-shortlist.md'),
      'utf8',
    );
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(shortlist, /docs\/phase2-providers\.md|phase2-providers\.md/);
    assert.match(readme, /docs\/phase2-providers\.md/);
  });

  it('registry keeps Phase-2 stub ids enabled.live and enabled.sandbox false', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    for (const id of PHASE2_STUB_IDS) {
      assert.ok(byId.has(id), `registry missing ${id}`);
      const en = byId.get(id).enabled;
      assert.equal(en.live, false, `${id}.enabled.live`);
      assert.equal(en.sandbox, false, `${id}.enabled.sandbox`);
    }
  });
});
