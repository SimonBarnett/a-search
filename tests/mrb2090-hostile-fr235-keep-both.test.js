'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const {
  createShopsRegistry,
  ALLOWED_TRANSITIONS,
} = (() => {
  const reg = require('../shared/shops/registry');
  const st = require('../shared/shops/status');
  return { ...reg, ...st };
})();
const { createMemoryVault, createCredentialsVault, vaultSecretName } = require('../shared/shops/vault');

describe('MRB #2090 hostile keep-both FR-235+FR-236', () => {
  it('CDK keeps GET/DELETE merchant shops and Shopify webhook', () => {
    const stack = fs.readFileSync(path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'), 'utf8');
    assert.match(stack, /path:\s*'\/merchant\/shops'/);
    assert.match(stack, /path:\s*'\/merchant\/shops\/\{shopId\}'/);
    assert.match(stack, /path:\s*'\/webhooks\/shop\/shopify'/);
    assert.doesNotMatch(stack, /^<<<<<<<|^=======|^>>>>>>>/m);
  });

  it('vault exports both createMemoryVault and createCredentialsVault', () => {
    assert.equal(typeof createMemoryVault, 'function');
    assert.equal(typeof createCredentialsVault, 'function');
    assert.equal(typeof vaultSecretName, 'function');
    assert.equal(vaultSecretName('live', 'shp_x'), 'a-search/live/shops/shp_x');
  });

  it('registry FR-236 aliases + pending_payment->suspended for uninstall', () => {
    assert.ok(ALLOWED_TRANSITIONS.pending_payment.includes('suspended'));
    const shops = createShopsRegistry();
    const row = shops.insert({
      merchantUserId: 'M1',
      env: 'sandbox',
      provider: 'shopify',
      providerShopId: 'gone.myshopify.com',
      shopDomain: 'gone.myshopify.com',
      credentialsSecretRef: 'vault:shopify:gone.myshopify.com',
    });
    assert.equal(typeof shops.getByShopId, 'function');
    assert.equal(typeof shops.getByProviderShopId, 'function');
    assert.equal(typeof shops.updateStatus, 'function');
    assert.equal(typeof shops.deleteByShopId, 'function');
    shops.updateStatus(row.shopId, 'suspended', 'uninstalled');
    const got = shops.getByShopId(row.shopId);
    assert.equal(got.status, 'suspended');
    assert.equal(got.statusReason, 'uninstalled');
    assert.equal(got.suspendReason, 'uninstalled');
    assert.equal(
      shops.getByProviderShopId('shopify', 'gone.myshopify.com').shopId,
      row.shopId,
    );
    assert.equal(shops.deleteByShopId(row.shopId), true);
    assert.equal(shops.getByShopId(row.shopId), null);
  });

  it('entry wires list/delete and shopify webhook without conflict markers', () => {
    const idx = fs.readFileSync(path.join(ROOT, 'entry', 'src', 'index.js'), 'utf8');
    assert.match(idx, /handleMerchantShops/);
    assert.match(idx, /handleShopifyWebhook/);
    assert.match(idx, /matchShopifyWebhookRoute/);
    assert.doesNotMatch(idx, /^<<<<<<<|^=======|^>>>>>>>/m);
    const reg = fs.readFileSync(path.join(ROOT, 'shared', 'shops', 'registry.js'), 'utf8');
    assert.doesNotMatch(reg, /^<<<<<<<|^=======|^>>>>>>>/m);
    const vault = fs.readFileSync(path.join(ROOT, 'shared', 'shops', 'vault.js'), 'utf8');
    assert.doesNotMatch(vault, /^<<<<<<<|^=======|^>>>>>>>/m);
  });
});
