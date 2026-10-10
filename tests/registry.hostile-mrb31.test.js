'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { enabled, loadRegistry } = require('../providers/loadRegistry');

describe('MRB #31 hostile: loadRegistry contract', () => {
  it('enabled() rejects envs other than live|sandbox', () => {
    assert.throws(() => enabled('prod'), /live|sandbox/);
    assert.throws(() => enabled(''), /live|sandbox/);
    assert.throws(() => enabled(undefined), /live|sandbox/);
  });

  it('registry has exactly 20 shortlist sources with folder matching kind', () => {
    const { sources } = loadRegistry();
    assert.equal(sources.length, 20);
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
    const live = [...enabled('live')].sort();
    const sandbox = [...enabled('sandbox')].sort();
    assert.deepEqual(live, sandbox);
    // FR-167 kijiji + FR-169 aliexpress on the default-on set (both envs).
    assert.deepEqual(live, [
      'aliexpress',
      'amazon',
      'awin',
      'cj',
      'ebay',
      'impact',
      'kelkoo',
      'rakuten',
    ]);
  });
});
