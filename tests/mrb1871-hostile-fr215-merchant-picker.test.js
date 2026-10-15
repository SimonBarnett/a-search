'use strict';

/**
 * MRB #1871 docs/hostile: FR-215 merchant Add-shop picker.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const {
  MERCHANT_PLATFORM_IDS,
  listMerchantConnectProviders,
  canAdvanceToConnect,
  needsInterestCapture,
} = require('../shared/merchantWizard');

describe('MRB #1871 hostile FR-215 merchant picker', () => {
  it('seven platforms no prestashop; wizard packed; coming-soon interest', () => {
    assert.deepEqual(
      [...MERCHANT_PLATFORM_IDS].sort(),
      [
        'bigcommerce',
        'ecwid',
        'magento',
        'shopify',
        'squarespace',
        'wix',
        'woocommerce',
      ].sort(),
    );
    assert.ok(!MERCHANT_PLATFORM_IDS.includes('prestashop'));
    assert.ok(!MERCHANT_PLATFORM_IDS.includes('ebay'));

    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'shared', 'package.json'), 'utf8'),
    );
    assert.ok(pkg.files.includes('merchantWizard.js'));

    const reg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'providers', 'registry.json'), 'utf8'),
    );
    const rows = listMerchantConnectProviders(reg, { env: 'live' });
    assert.equal(rows.length, 7);
    const shopify = rows.find((r) => r.id === 'shopify');
    assert.equal(shopify.connectEnabled, true);
    assert.equal(canAdvanceToConnect('shopify', reg, { env: 'live' }), true);
    const wix = rows.find((r) => r.id === 'wix');
    assert.equal(wix.comingSoon, true);
    assert.equal(needsInterestCapture('wix', reg, { env: 'live' }), true);
    assert.equal(canAdvanceToConnect('wix', reg, { env: 'live' }), false);

    const fr = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-215.md'), 'utf8');
    assert.match(fr, /merchantWizard\.js/);
    assert.match(fr, /PrestaShop/);
  });
});
