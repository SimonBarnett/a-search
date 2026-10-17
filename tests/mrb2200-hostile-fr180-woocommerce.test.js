'use strict';

/**
 * docs/mrb-2200 hostile pin for FR-180 enable woocommerce merchant (PR #2200 / #1027).
 * Floors 30 after keep-both webgains (FR-173) and woocommerce (FR-180).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const STILL_DARK = ['admitad', 'flexoffers'];

describe('MRB-2200 FR-180 woocommerce enable hostile', () => {
  it('registry woo merchant both envs; PROVIDER_CREDENTIAL_KEYS contiguous; no AFFILIATE key', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const woo = registry.sources.find((s) => s.id === 'woocommerce');
    assert.ok(woo);
    assert.equal(woo.enabled.live, true);
    assert.equal(woo.enabled.sandbox, true);
    assert.equal(woo.class, 'merchant');
    assert.equal(woo.merchantConnect, true);
    const wix = registry.sources.find((x) => x.id === 'wix');
    assert.equal(wix.enabled.live, true, 'wix');
    assert.equal(wix.enabled.sandbox, true, 'wix');
    for (const id of STILL_DARK) {
      const s = registry.sources.find((x) => x.id === id);
      assert.equal(s.enabled.live, false, id);
      assert.equal(s.enabled.sandbox, false, id);
    }
    const both = registry.sources.filter(
      (s) => s.enabled && s.enabled.live && s.enabled.sandbox,
    );
    assert.equal(both.length, 15);
    const stack = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(
      stack,
      /woocommerce:\s*\[\s*'WOOCOMMERCE_CONSUMER_KEY',\s*'WOOCOMMERCE_CONSUMER_SECRET',\s*'WOOCOMMERCE_STORE_URL',?\s*\]/,
    );
    assert.doesNotMatch(stack, /WOOCOMMERCE_AFFILIATE/);
    assert.doesNotMatch(stack, /^<<<<<<<|^=======|^>>>>>>>/m);
  });

  it('FR-180 Decision LOCKED UTF-8 no-BOM; worker plain URLs; floors 28', () => {
    const buf = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-180.md'));
    assert.notEqual(buf[0], 0xef);
    const fr = buf.toString('utf8');
    assert.ok(!/[\u2013\u2014]/.test(fr));
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /merchantConnect/);
    assert.match(fr, /WOOCOMMERCE_CONSUMER_KEY/);
    const worker = fs.readFileSync(
      path.join(root, 'providers', 'local', 'woocommerce', 'src', 'worker.js'),
      'utf8',
    );
    assert.match(worker, /plain absolute shop URLs \(no affiliate sid stamp\)/);
    assert.doesNotMatch(worker, /buildTrackedUrl\(/);
    assert.doesNotMatch(worker, /WOOCOMMERCE_AFFILIATE_ID/);
    const fr142 = fs.readFileSync(
      path.join(root, 'tests', 'fr142-sqs-dlq.test.js'),
      'utf8',
    );
    assert.match(fr142, /expected 30 primary queues/);
    const fr112 = fs.readFileSync(
      path.join(root, 'tests', 'fr112-woocommerce-selftest-probe.test.js'),
      'utf8',
    );
    assert.match(fr112, /enabled true both envs \(FR-180\)/);
    assert.doesNotMatch(fr112, /enabled stays false/);
  });
});
