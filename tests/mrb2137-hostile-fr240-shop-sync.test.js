'use strict';

/**
 * docs/mrb-2137: hostile pins for FR-240 shop sync.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR = path.join(ROOT, 'docs', 'fr', 'FR-240.md');
const SYNC = path.join(ROOT, 'shared', 'shops', 'shopSync.js');
const MIG = path.join(ROOT, 'db', 'migrations', '012_PartFeedKeys_shop_kind.sql');
const TEST = path.join(ROOT, 'tests', 'merchant-shop-sync.test.js');

describe('docs/mrb-2137 FR-240 shop sync', () => {
  it('Decision LOCKED + no credentials in SQS + active-only paid + Kind=shop migration', () => {
    const buf = fs.readFileSync(FR);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    for (const b of buf) assert.ok(b < 128, 'FR-240.md ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /MessageGroupId|shop-sync\.fifo/i);
    assert.match(text, /trialing.*unpaid|active.*only/i);
    assert.match(text, /never carry credentials|Credentials never/i);
    assert.match(text, /madeiradb read-only|Never madeiradb/i);

    const sync = fs.readFileSync(SYNC, 'utf8');
    assert.match(sync, /assertNoCredentials/);
    assert.match(sync, /isShopPaid/);
    assert.match(sync, /MessageGroupId/);
    assert.match(sync, /skipped_unpaid|ShopSyncSkipped/);
    assert.match(sync, /suspended\(auth\)|statusReason.*auth|auth/);
    assert.doesNotMatch(sync, /console\.log\([^)]*secret|console\.log\([^)]*token/i);

    const mig = fs.readFileSync(MIG, 'utf8');
    assert.match(mig, /Kind/);
    assert.match(mig, /Active/);
    assert.match(mig, /Locator/);
    assert.match(mig, /a_search|Never madeiradb/i);

    assert.ok(fs.existsSync(TEST));
  });
});