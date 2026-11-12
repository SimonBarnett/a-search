'use strict';

/**
 * MRB #5340 hostile: FR #5323 checklist names hold-dark ids; registry untouched.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CHECKLIST = path.join(ROOT, 'docs', 'release-checklist.md');
const REGISTRY = path.join(ROOT, 'providers', 'registry.json');
const PIN = path.join(ROOT, 'tests', 'fr5323-release-checklist-hold-ids.test.js');

const HOLD_IDS = ['bol', 'aliexpress', 'avantlink', 'flexoffers', 'admitad'];
const MERCHANT_LATER = ['squarespace', 'magento', 'ecwid', 'bigcommerce'];

describe('MRB #5340 hostile FR #5323 release-checklist hold-dark', () => {
  it('implementer pin exists; checklist ASCII no BOM', () => {
    assert.ok(fs.existsSync(PIN), 'missing tests/fr5323-release-checklist-hold-ids.test.js');
    const raw = fs.readFileSync(CHECKLIST);
    assert.notEqual(raw[0], 0xef, 'UTF-8 without BOM');
    for (let i = 0; i < raw.length; i++) {
      assert.ok(raw[i] < 128, 'release-checklist.md must stay ASCII');
    }
  });

  it('hold ids and later merchants remain enabled false in registry (PR must not flip)', () => {
    const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    for (const id of HOLD_IDS.concat(MERCHANT_LATER)) {
      assert.ok(byId.has(id), 'registry missing ' + id);
      const en = byId.get(id).enabled;
      assert.equal(en.live, false, id + '.enabled.live must stay false');
      assert.equal(en.sandbox, false, id + '.enabled.sandbox must stay false');
    }
  });

  it('checklist hold line names all five holds; later merchants; every Phase-2 not required dark', () => {
    const text = fs.readFileSync(CHECKLIST, 'utf8');
    assert.match(text, /Do not require every Phase-2 id to remain dark/i);
    assert.doesNotMatch(text, /Stay-dark Phase-2 providers remain/i);
    const holdLine = text
      .split(/\r?\n/)
      .find((l) => /hold-dark/i.test(l) && HOLD_IDS.every((id) => l.includes(id)));
    assert.ok(holdLine, 'missing hold-dark line with all five ids');
    for (const id of MERCHANT_LATER) {
      assert.match(text, new RegExp('\\b' + id + '\\b'));
    }
  });
});
