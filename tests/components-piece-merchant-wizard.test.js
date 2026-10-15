'use strict';

/**
 * FR-215 / #1220: merchant Add-shop provider picker.
 * List from registry merchantConnect + locked MERCHANT platforms; selection
 * required before connect; disabled = coming soon + interest (not error).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const wizard = require(path.join(root, 'shared', 'merchantWizard.js'));
const registry = require(path.join(root, 'providers', 'registry.json'));

const MOCK_HOME = path.join(
  root,
  'docs',
  'mocks',
  'components-piece-merchant',
  'home.html',
);
const PAGE = path.join(
  root,
  'components-piece',
  'merchant-wizard',
  'index.html',
);
const FR215 = path.join(root, 'docs', 'fr', 'FR-215.md');

const EXPECTED_IDS = [
  'shopify',
  'wix',
  'woocommerce',
  'squarespace',
  'magento',
  'bigcommerce',
  'ecwid',
];

describe('FR-215 merchant provider picker', () => {
  it('lists seven MERCHANT platforms from registry flag + plan (no prestashop)', () => {
    const list = wizard.listMerchantConnectProviders(registry);
    const ids = list.map((p) => p.id);
    assert.deepEqual(ids, EXPECTED_IDS);
    assert.ok(!ids.includes('prestashop'));
    assert.ok(!ids.includes('ebay'));
    assert.ok(!ids.includes('etsy'));
    for (const p of list) {
      assert.equal(p.class, 'merchant');
      assert.equal(typeof p.label, 'string');
      assert.ok(p.label.length > 0);
      assert.equal(typeof p.connectEnabled, 'boolean');
      assert.equal(typeof p.comingSoon, 'boolean');
    }
  });

  it('shopify is connect-enabled when registry says so; others may be coming soon', () => {
    const list = wizard.listMerchantConnectProviders(registry);
    const byId = Object.fromEntries(list.map((p) => [p.id, p]));
    assert.equal(byId.shopify.connectEnabled, true);
    assert.equal(byId.shopify.comingSoon, false);
    // At least one coming-soon platform exists for interest capture UX
    assert.ok(list.some((p) => p.comingSoon === true));
  });

  it('cannot advance to connect without a selection', () => {
    assert.equal(wizard.canAdvanceToConnect(null, registry), false);
    assert.equal(wizard.canAdvanceToConnect('', registry), false);
    assert.equal(wizard.canAdvanceToConnect(undefined, registry), false);
    assert.equal(wizard.canAdvanceToConnect('shopify', registry), true);
  });

  it('cannot advance to connect on coming-soon / unknown ids (interest path instead)', () => {
    const list = wizard.listMerchantConnectProviders(registry);
    const soon = list.find((p) => p.comingSoon);
    assert.ok(soon, 'expected a coming-soon platform');
    assert.equal(wizard.canAdvanceToConnect(soon.id, registry), false);
    assert.equal(wizard.needsInterestCapture(soon.id, registry), true);
    assert.equal(wizard.needsInterestCapture('shopify', registry), false);
    assert.equal(wizard.canAdvanceToConnect('prestashop', registry), false);
    assert.equal(wizard.canAdvanceToConnect('ebay', registry), false);
  });

  it('picker page + mocks exist ASCII and list providers', () => {
    assert.ok(fs.existsSync(PAGE), 'missing components-piece/merchant-wizard/index.html');
    assert.ok(fs.existsSync(MOCK_HOME), 'missing merchant home mock');
    for (const file of [PAGE, MOCK_HOME]) {
      const buf = fs.readFileSync(file);
      assert.notEqual(buf[0], 0xef, `${file}: no BOM`);
      const text = buf.toString('utf8');
      for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        assert.ok(
          c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126),
          `${file}: non-ASCII at ${i}`,
        );
      }
      for (const id of EXPECTED_IDS) {
        assert.match(text, new RegExp(id, 'i'), `${file} missing ${id}`);
      }
      assert.doesNotMatch(text, /prestashop/i);
      assert.match(text, /Add shop|merchant/i);
      assert.match(text, /coming soon/i);
    }
  });

  it('FR-215 stub points at picker module and seven-platform enum', () => {
    const text = fs.readFileSync(FR215, 'utf8');
    assert.match(text, /merchantConnect/);
    assert.match(text, /shopify/);
    assert.match(text, /woocommerce/);
    assert.match(text, /ecwid/);
    assert.match(text, /DROPPED|dropped|no prestashop|without prestashop/i);
    assert.match(text, /shared\/merchantWizard\.js|merchant-wizard/);
  });
});
