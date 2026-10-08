'use strict';

/**
 * MRB #608 hostile: FR #607 shopify/wix/woocommerce disabled local stubs
 * remain off, match FR-022/FR-060i layout, and stay documented for Madeira.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const IDS = ['shopify', 'wix', 'woocommerce'];

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

describe('MRB #608 hostile FR-607 Madeira local providers', () => {
  it('registry keeps all three disabled with SQS_*_URL queueEnv', () => {
    const { loadRegistry } = require('../providers/loadRegistry');
    const { sources } = loadRegistry();
    assert.equal(sources.length, 20);
    for (const id of IDS) {
      const s = sources.find((x) => x.id === id);
      assert.ok(s, id);
      assert.equal(s.kind, 'local');
      assert.equal(s.enabled.live, false);
      assert.equal(s.enabled.sandbox, false);
      assert.equal(s.queueEnv, `SQS_${id.toUpperCase()}_URL`);
      assert.equal(s.folder, `providers/local/${id}`);
    }
  });

  it('shortlist + vision extensibility pins Madeira store ids', () => {
    const shortlist = utf8NoBom('docs/provider-shortlist.md');
    const vision = utf8NoBom('docs/vision.md');
    assert.match(vision, /Extensibility \+ per-source on\/off/);
    assert.match(vision, /New source = folder \+ registry \+ queue/);
    for (const id of IDS) {
      assert.match(shortlist, new RegExp(`\`${id}\``), id);
      assert.match(shortlist, /Madeira/i);
    }
  });

  for (const id of IDS) {
    it(`${id} stub run() rejects non-object and returns source id`, async () => {
      const { run } = require(path.join(root, 'providers', 'local', id, 'src', 'worker.js'));
      await assert.rejects(() => run(null), /message object/);
      const out = await run({ searchId: 's1', env: 'sandbox' });
      assert.equal(out.source, id);
      assert.equal(out.ok, true);
      assert.match(String(out.message), /stub/i);
    });
  }

  it('onboarding skills mark UNKNOWN / not enabled (FR-060i)', () => {
    for (const id of IDS) {
      const text = utf8NoBom(
        path.join(
          'providers',
          'local',
          id,
          '.grok',
          'skills',
          `a-search-${id}-onboarding`,
          'SKILL.md',
        ),
      );
      assert.match(text, /CAST IRON/);
      assert.match(text, /SimonBarnett\/a-search/);
      assert.match(text, /UNKNOWN|not enabled|disabled/i);
    }
  });
});
