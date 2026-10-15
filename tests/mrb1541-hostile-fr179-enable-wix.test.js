'use strict';

/**
 * MRB #1541 hostile pin: FR-179 enable wix merchant on main via fix #2260.
 * Floors 13 enabled x live+sandbox = 26; no affiliate sid; woocommerce stays dark.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('mrb1541: wix enabled merchant both envs; floors 28; no AFFILIATE; woocommerce dark', () => {
  const reg = JSON.parse(
    fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
  );
  const wix = reg.sources.find((s) => s.id === 'wix');
  assert.ok(wix);
  assert.equal(wix.enabled.live, true);
  assert.equal(wix.enabled.sandbox, true);
  assert.equal(wix.class, 'merchant');
  assert.equal(wix.merchantConnect, true);

  const woo = reg.sources.find((s) => s.id === 'woocommerce');
  assert.ok(woo);
  assert.equal(woo.enabled.live, false);
  assert.equal(woo.enabled.sandbox, false);

  const enabled = reg.sources.filter(
    (s) => s.enabled && s.enabled.live && s.enabled.sandbox,
  );
  assert.equal(enabled.length, 13, `expected 13 enabled, got ${enabled.length}`);
  assert.ok(enabled.some((s) => s.id === 'wix'));
  assert.ok(enabled.some((s) => s.id === 'shopify'));
  assert.equal(enabled.some((s) => s.id === 'woocommerce'), false);

  const stack = fs.readFileSync(
    path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
    'utf8',
  );
  assert.match(stack, /PROVIDER_CREDENTIAL_KEYS[\s\S]*?\bwix\s*:/);
  assert.match(stack, /WIX_API_BASE/);
  assert.doesNotMatch(stack, /\bwix\b[\s\S]{0,120}AFFILIATE|AFFILIATE[\s\S]{0,120}\bwix\b/);

  const worker = fs.readFileSync(
    path.join(root, 'providers', 'local', 'wix', 'src', 'worker.js'),
    'utf8',
  );
  assert.match(worker, /resolveWixProductUrl/);
  assert.match(worker, /FR-179 merchant/);
  assert.doesNotMatch(worker, /sid=.*aff|WIX_AFFILIATE_ID/);

  const fr179 = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-179.md'), 'utf8');
  assert.match(fr179, /Decision \(LOCKED\)/);
  assert.match(fr179, /merchant/);

  const pin = fs.readFileSync(
    path.join(root, 'tests', 'fr179-enable-wix.test.js'),
    'utf8',
  );
  assert.match(pin, /FR-179/);
  assert.match(pin, /aws-cdk-lib/);
});
