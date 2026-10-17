'use strict';

/**
 * Hostile pins for FR-180 enable woocommerce (merchant; no affiliate stamp).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const STILL_DARK = ['admitad', 'flexoffers'];

describe('hostile FR-180 enable woocommerce', () => {
  it('floors 28 = 14 enabled x live+sandbox; woo+wix on; siblings dark', () => {
    const { loadRegistry, enabled } = require('../providers/loadRegistry');
    const live = enabled('live');
    assert.equal(live.length, 15);
    assert.ok(live.includes('woocommerce'));
    assert.ok(live.includes('shopify'));
    assert.ok(live.includes('wix'));
        const { sources } = loadRegistry();
    const woo = sources.find((s) => s.id === 'woocommerce');
    assert.equal(woo.enabled.sandbox, true);
    assert.equal(woo.class, 'merchant');
    assert.equal(woo.merchantConnect, true);
    for (const id of STILL_DARK) {
      const s = sources.find((x) => x.id === id);
      assert.equal(s.enabled.live, false, id);
      assert.equal(s.enabled.sandbox, false, id);
    }
  });

  it('worker has no affiliate stamp; FR-180 Decision LOCKED ASCII', () => {
    const worker = fs.readFileSync(
      path.join(root, 'providers', 'local', 'woocommerce', 'src', 'worker.js'),
      'utf8',
    );
    assert.doesNotMatch(worker, /buildTrackedUrl\(/);
    assert.doesNotMatch(worker, /WOOCOMMERCE_AFFILIATE_ID/);
    assert.doesNotMatch(worker, /accountQueryMap/);
    assert.match(worker, /plain absolute shop URLs/);
    const fr = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-180.md'), 'utf8');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(fr));
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'woocommerce', '.env.example'),
      'utf8',
    );
    assert.doesNotMatch(envEx, /WOOCOMMERCE_AFFILIATE_ID/);
  });

  it('CDK keys include woo store trio; secrets-matrix stay-dark omits woo', () => {
    const stack = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /woocommerce:\s*\[/);
    assert.match(stack, /WOOCOMMERCE_CONSUMER_KEY/);
    assert.doesNotMatch(stack, /WOOCOMMERCE_AFFILIATE_ID/);
    const matrix = fs.readFileSync(
      path.join(root, 'docs', 'secrets-matrix.md'),
      'utf8',
    );
    const omit = matrix.match(/Stay-dark omitted[\s\S]*?(?=\n\n|\nPublic)/);
    assert.ok(omit);
    assert.doesNotMatch(omit[0], /\bwoocommerce\b/);
    assert.doesNotMatch(omit[0], /\bwix\b/);
  });
});
