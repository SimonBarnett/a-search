'use strict';

/**
 * MRB #2094 docs/hostile: FR-236 Shopify OAuth offline connect + webhooks.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const {
  assertMyshopifyDomain,
  verifyShopifyHmac,
} = require('../shared/shops/adapters/shopify');

describe('MRB #2094 hostile FR-236 shopify connect', () => {
  it('Decision LOCKED; myshopify gate; HMAC; vault pointer; webhook+CDK wires', () => {
    const fr = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-236.md'), 'utf8');
    assert.match(fr, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(fr, /offline/);
    assert.match(fr, /pending_payment/);
    assert.match(fr, /app\/uninstalled/);

    assert.doesNotThrow(() =>
      assertMyshopifyDomain('example.myshopify.com'),
    );
    assert.throws(() => assertMyshopifyDomain('evil.example.com'));

    const adapter = fs.readFileSync(
      path.join(ROOT, 'shared', 'shops', 'adapters', 'shopify.js'),
      'utf8',
    );
    assert.match(adapter, /verifyShopifyHmac/);
    assert.match(adapter, /vault:shopify:/);
    assert.match(adapter, /access_token/);

    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /path:\s*'\/webhooks\/shop\/shopify'/);

    const index = fs.readFileSync(
      path.join(ROOT, 'entry', 'src', 'index.js'),
      'utf8',
    );
    assert.match(index, /shopifyWebhooks|handleShopifyWebhook/);

    const vault = fs.readFileSync(
      path.join(ROOT, 'shared', 'shops', 'vault.js'),
      'utf8',
    );
    assert.match(vault, /createCredentialsVault|createMemoryVault/);
    assert.match(vault, /never log/i);
  });
});