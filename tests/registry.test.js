'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { enabled, loadRegistry } = require('../providers/loadRegistry');

// FR-167 kijiji + FR-169 aliexpress live+sandbox; keep in DEFAULT_ON.
const DEFAULT_ON = [
  'etsy',
  'amazon',
  'aliexpress',
  'ebay',
  'awin',
  'rakuten',
  'cj',
  'impact',
  'kelkoo',
];
const DEFAULT_OFF = [
  'partnerize',
  'webgains',
  'tradedoubler',
  'admitad',
  'skimlinks',
  'bol',
  'flexoffers',
  'avantlink',
  'shopify',
  'wix',
  'woocommerce',
];

describe('providers/loadRegistry', () => {
  it("enabled('live') returns exactly the default-on ids", () => {
    const ids = enabled('live');
    assert.deepEqual([...ids].sort(), [...DEFAULT_ON].sort());
  });

  it("a default-off id is absent from enabled('sandbox')", () => {
    const ids = enabled('sandbox');
    for (const id of DEFAULT_OFF) {
      assert.equal(ids.includes(id), false, `expected ${id} off in sandbox`);
    }
    assert.deepEqual([...ids].sort(), [...DEFAULT_ON].sort());
  });

  it('registry lists every shortlist source with per-env enabled', () => {
    const registry = loadRegistry();
    assert.ok(Array.isArray(registry.sources));
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    for (const id of [...DEFAULT_ON, ...DEFAULT_OFF]) {
      const src = byId.get(id);
      assert.ok(src, `missing source ${id}`);
      assert.ok(src.kind === 'live' || src.kind === 'local', `${id}.kind`);
      assert.equal(typeof src.folder, 'string');
      assert.equal(typeof src.enabled.live, 'boolean');
      assert.equal(typeof src.enabled.sandbox, 'boolean');
    }
  });
});
