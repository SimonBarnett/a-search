'use strict';

/**
 * docs/mrb-2125: hostile pins for FR-238 WooCommerce connect.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR = path.join(ROOT, 'docs', 'fr', 'FR-238.md');
const ADAPTER = path.join(ROOT, 'shared', 'shops', 'adapters', 'woocommerce.js');
const INDEX = path.join(ROOT, 'shared', 'shops', 'adapters', 'index.js');
const ENTRY = path.join(ROOT, 'entry', 'src', 'merchantShops.js');
const TEST = path.join(ROOT, 'tests', 'fr238-woocommerce-connect.test.js');

describe('docs/mrb-2125 FR-238 WooCommerce connect', () => {
  it('Decision LOCKED + HTTPS SSRF + read-only keys + wc-auth user_id state', () => {
    const buf = fs.readFileSync(FR);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    for (const b of buf) assert.ok(b < 128, 'FR-238.md ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /wc-auth/);
    assert.match(text, /SSRF|private/i);
    assert.match(text, /key_permissions|read-only|scope=read/i);
    assert.match(text, /pending_payment/);

    const adapter = fs.readFileSync(ADAPTER, 'utf8');
    assert.match(adapter, /normalizeShopOrigin/);
    assert.match(adapter, /PRIVATE_IP_RE|PRIVATE_HOST_RE/);
    assert.match(adapter, /invalid_key_permissions/);
    assert.match(adapter, /user_id/);
    assert.match(adapter, /vault:woocommerce:/);
    assert.doesNotMatch(adapter, /console\.log/);

    const index = fs.readFileSync(INDEX, 'utf8');
    assert.match(index, /woocommerce/);

    const entry = fs.readFileSync(ENTRY, 'utf8');
    assert.match(entry, /user_id/);
    assert.match(entry, /invalid_key_permissions/);

    assert.ok(fs.existsSync(TEST));
  });
});