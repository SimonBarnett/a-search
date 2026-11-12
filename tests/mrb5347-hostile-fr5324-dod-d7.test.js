'use strict';

/**
 * MRB #5347 hostile: FR #5324 D7 hold ids stay false; intentional enables stay true.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'release-installable.md');
const REGISTRY = path.join(ROOT, 'providers', 'registry.json');
const PIN = path.join(ROOT, 'tests', 'fr5324-dod-d7-market-hold.test.js');

const HOLD_IDS = ['bol', 'aliexpress', 'avantlink', 'flexoffers', 'admitad'];
const ENABLED_ON_PURPOSE = [
  'kelkoo',
  'skimlinks',
  'etsy',
  'partnerize',
  'webgains',
  'tradedoubler',
  'shopify',
  'wix',
  'woocommerce',
];

describe('MRB #5347 hostile FR #5324 D7 market-hold', () => {
  it('implementer pin exists; D7 row ASCII no BOM', () => {
    assert.ok(fs.existsSync(PIN));
    const raw = fs.readFileSync(DOC);
    assert.notEqual(raw[0], 0xef);
    const d7 = raw
      .toString('utf8')
      .split(/\r?\n/)
      .find((l) => /^\|\s*D7\s*\|/i.test(l));
    assert.ok(d7);
    for (let i = 0; i < d7.length; i++) {
      assert.ok(d7.charCodeAt(i) < 128, 'D7 row must stay ASCII');
    }
  });

  it('registry matches D7: holds false; intentional enables true; no amazon hold', () => {
    const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    for (const id of HOLD_IDS) {
      const en = byId.get(id).enabled;
      assert.equal(en.live, false, id + ' must stay dark');
      assert.equal(en.sandbox, false, id + ' must stay dark');
    }
    for (const id of ENABLED_ON_PURPOSE) {
      const en = byId.get(id).enabled;
      assert.equal(en.live, true, id + ' is in-scope fan-out');
      assert.equal(en.sandbox, true, id + ' is in-scope fan-out');
    }
    const d7 = fs
      .readFileSync(DOC, 'utf8')
      .split(/\r?\n/)
      .find((l) => /^\|\s*D7\s*\|/i.test(l));
    assert.doesNotMatch(d7, /\bamazon\b/i);
    assert.doesNotMatch(d7, /every Phase-2 stub ids remain/i);
  });
});
