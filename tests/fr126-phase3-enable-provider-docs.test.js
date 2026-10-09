'use strict';

/**
 * FR-126: Phase-3 enable-provider docs + pin template.
 * This FR must NOT flip any Phase-2 stay-dark id to enabled.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const doc = path.join(root, 'docs', 'phase3-enable-provider.md');
const registryPath = path.join(root, 'providers', 'registry.json');

/** Phase-2 stay-dark ids (must remain false on this PR). */
const PHASE2_STUB_IDS = [
  'kelkoo',
  'skimlinks',
  'aliexpress',
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

function utf8NoBom(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.notEqual(buf[0], 0xef, `${rel} must be UTF-8 without BOM`);
  return buf.toString('utf8');
}

describe('FR-126 phase3 enable-provider docs + stay-dark pin', () => {
  it('docs/phase3-enable-provider.md has ritual needles', () => {
    assert.ok(fs.existsSync(doc), 'missing docs/phase3-enable-provider.md');
    const text = utf8NoBom('docs/phase3-enable-provider.md');
    assert.match(text, /FR-?126|Phase-?3/i);
    assert.match(text, /one.?provider|single provider|one id/i);
    assert.match(text, /secret|credential/i);
    assert.match(text, /enabled\.live|enabled\.sandbox|registry\.json/i);
    assert.match(text, /stay.?dark|others stay|other ids/i);
    assert.match(text, /selftest/i);
    assert.match(
      text,
      /does\s+\*{0,2}not\*{0,2}\s+enable|Do not enable|must not enable|does not enable/i,
    );
    // Local provider gate order from operator evidence on #955
    assert.match(text, /Parts|DDL|maintainer/i);
    assert.match(text, /least-privilege|FR-122|#951/i);
  });

  it('phase2-providers.md and provider-shortlist.md point at the template', () => {
    const phase2 = utf8NoBom('docs/phase2-providers.md');
    const shortlist = utf8NoBom('docs/provider-shortlist.md');
    assert.match(
      phase2,
      /docs\/phase3-enable-provider\.md|phase3-enable-provider\.md/,
    );
    assert.match(
      shortlist,
      /docs\/phase3-enable-provider\.md|phase3-enable-provider\.md/,
    );
  });

  it('README Docs links phase3-enable-provider.md', () => {
    const readme = utf8NoBom('README.md');
    assert.match(readme, /docs\/phase3-enable-provider\.md/);
  });

  it('registry keeps all Phase-2 stub ids enabled.live and enabled.sandbox false', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    for (const id of PHASE2_STUB_IDS) {
      assert.ok(byId.has(id), `registry missing ${id}`);
      const en = byId.get(id).enabled;
      assert.equal(en.live, false, `${id}.enabled.live must stay false on FR-126`);
      assert.equal(
        en.sandbox,
        false,
        `${id}.enabled.sandbox must stay false on FR-126`,
      );
    }
  });
});
