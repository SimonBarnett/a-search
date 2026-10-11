'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { enabled, loadRegistry } = require('../providers/loadRegistry');

// Phase-4 keep-both: tradedoubler (FR-174) + woocommerce merchant (FR-180)
const DEFAULT_ON = [
  'amazon',
  'ebay',
  'rakuten',
  'cj',
  'awin',
  'impact',
  'kelkoo',
  'aliexpress',
  'etsy',
  'skimlinks',
  'bol',
  'partnerize',
  'tradedoubler',
  'woocommerce',
];
const DEFAULT_OFF = [
  'webgains',
  'admitad',
  'flexoffers',
  'avantlink',
  'shopify',
  'wix',
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
      assert.ok(byId.has(id), id);
      assert.equal(typeof byId.get(id).enabled.live, 'boolean', id);
      assert.equal(typeof byId.get(id).enabled.sandbox, 'boolean', id);
    }
  });
});
