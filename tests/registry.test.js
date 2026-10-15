'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { enabled, loadRegistry } = require('../providers/loadRegistry');

// GBP/UK market hold: bol, aliexpress, avantlink off (FR-253..255); keep UK-capable DEFAULT_ON.
const DEFAULT_ON = [
  'amazon',
  'ebay',
  'rakuten',
  'cj',
  'awin',
  'impact',
  'kelkoo',
  'etsy',
  'skimlinks',
  'shopify',
  'partnerize',
  'tradedoubler',
  'webgains',
];
const DEFAULT_OFF = [
  'admitad',
  'flexoffers',
  'wix',
  'woocommerce',
  'bol',
  'aliexpress',
  'avantlink',
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
