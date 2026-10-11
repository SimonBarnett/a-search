'use strict';

/**
 * MRB #668 hostile: FR-061 Phase-2 stay-dark docs after product merge.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function utf8NoBom(rel) {
  const p = path.join(root, rel);
  const buf = fs.readFileSync(p);
  assert.equal(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, false, rel);
  assert.equal(buf[buf.length - 1], 0x0a, `trailing newline ${rel}`);
  const text = buf.toString('utf8');
  for (const ln of text.split(/\r?\n/)) {
    assert.equal(ln.startsWith('<<<<<<< '), false, rel);
    assert.equal(ln.startsWith('======= '), false, rel);
    assert.equal(ln.startsWith('>>>>>>> '), false, rel);
  }
  return text;
}

describe('MRB #668 hostile FR-061 stay-dark', () => {
  it('phase2-providers CAST IRON stay-dark contiguous + no auto-enable', () => {
    const text = utf8NoBom('docs/phase2-providers.md');
    assert.match(text, /CAST IRON stay-dark rule/);
    const idx = text.indexOf('CAST IRON stay-dark rule');
    const window = text.slice(idx, idx + 420);
    assert.match(window, /enabled\.live=false/);
    assert.match(window, /enabled\.sandbox=false/);
    assert.match(window, /account details|credential/i);
    assert.match(text, /never auto-enable|must never auto-enable/i);
    assert.match(text, /fixture-backed|recorded fixtures/i);
  });

  it('vision S3 on/off still cited by shortlist pointer', () => {
    const vision = utf8NoBom('docs/vision.md');
    assert.match(vision, /Extensibility \+ per-source on\/off/);
    const shortlist = utf8NoBom('docs/provider-shortlist.md');
    assert.match(shortlist, /phase2-providers\.md/);
    assert.match(shortlist, /stay-dark/i);
  });

  it('exactly 11 Phase-2 stub ids stay dark in registry (kelkoo+aliexpress+etsy enabled)', () => {
    const { loadRegistry } = require('../providers/loadRegistry');
    const stubs = [
      'skimlinks',
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
    assert.equal(stubs.length, 11);
    const { sources } = loadRegistry();
    for (const id of stubs) {
      const s = sources.find((x) => x.id === id);
      assert.ok(s, id);
      assert.equal(s.enabled.live, false, id);
      assert.equal(s.enabled.sandbox, false, id);
    }
  });
});
