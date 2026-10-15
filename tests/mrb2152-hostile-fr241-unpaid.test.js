'use strict';

/**
 * docs/mrb-2152: hostile pins for FR-241 unpaid / hard-delete.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR = path.join(ROOT, 'docs', 'fr', 'FR-241.md');
const UNPAID = path.join(ROOT, 'shared', 'shops', 'unpaid.js');
const TEST = path.join(ROOT, 'tests', 'merchant-unpaid.test.js');

describe('docs/mrb-2152 FR-241 unpaid hard-delete', () => {
  it('Decision LOCKED + active-only + N2 7d + per-shop hard-delete + login retained', () => {
    const buf = fs.readFileSync(FR);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    for (const b of buf) assert.ok(b < 128, 'FR-241.md ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /subscriptionStatus === active|active` only/i);
    assert.match(text, /Hard-delete|hard-delete/);
    assert.match(text, /N2.*7 days|7 days earlier/i);
    assert.match(text, /per shop|Scope = per shop/i);
    assert.match(text, /login|Merchant login/i);
    assert.match(text, /madeiradb read-only|never delete madeiradb/i);

    const src = fs.readFileSync(UNPAID, 'utf8');
    assert.match(src, /N2_MIN_LEAD_MS\s*=\s*7\s*\*\s*86400000/);
    assert.match(src, /hardDeleteShopForNonPayment/);
    assert.match(src, /n2_too_recent|n2_missing/);
    assert.match(src, /consecutiveUnpaidPeriods/);
    assert.match(src, /Merchant login retained|login retained/i);

    assert.ok(fs.existsSync(TEST));
  });
});