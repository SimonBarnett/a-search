'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { enabled, loadRegistry } = require('../providers/loadRegistry');

// GBP/UK market hold: bol, aliexpress, avantlink off (FR-253..255).
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
  'wix',
  'woocommerce',
];

describe('MRB #31 hostile: loadRegistry contract', () => {
  it('enabled() rejects envs other than live|sandbox', () => {
    assert.throws(() => enabled('prod'), /live|sandbox/);
    assert.throws(() => enabled(''), /live|sandbox/);
    assert.throws(() => enabled(undefined), /live|sandbox/);
  });

  it('registry has exactly 22 shortlist sources with folder matching kind', () => {
    const { sources } = loadRegistry();
    assert.equal(sources.length, 22);
    for (const s of sources) {
      assert.ok(s.kind === 'live' || s.kind === 'local', s.id);
      assert.ok(
        s.folder.startsWith(`providers/${s.kind}/`),
        `${s.id} folder ${s.folder} must match kind ${s.kind}`,
      );
      assert.equal(typeof s.enabled, 'object');
      assert.equal(typeof s.enabled.live, 'boolean');
      assert.equal(typeof s.enabled.sandbox, 'boolean');
      // FR-002: enabled must be per-env object, not a legacy boolean
      assert.notEqual(typeof s.enabled, 'boolean');
    }
  });

  it("enabled('live') and enabled('sandbox') return the same default-on set", () => {
    const live = enabled('live');
    const sandbox = enabled('sandbox');
    assert.deepEqual([...live].sort(), [...DEFAULT_ON].sort());
    assert.deepEqual([...sandbox].sort(), [...DEFAULT_ON].sort());
  });
});
