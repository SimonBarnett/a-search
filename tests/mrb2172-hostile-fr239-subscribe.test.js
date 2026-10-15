'use strict';

/**
 * docs/mrb-2172: hostile contiguous pins for FR-239 merchant_shop subscribe
 * (product PR #2172 / issue #1353).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('docs/mrb-2172 hostile FR-239 pins', () => {
  it('subscribe.js contiguous merchant_shop / no-trial / cancel_at_period_end', () => {
    const src = read('shared/shops/subscribe.js');
    assert.match(src, /aSearchProduct=merchant_shop/);
    assert.match(src, /const ASE_PRODUCT_SHOP = 'merchant_shop'/);
    assert.match(src, /const ASE_PRODUCT_WIDGET = 'widget_upgrade'/);
    assert.match(src, /trial_period_days:\s*undefined/);
    assert.match(src, /cancel_at_period_end:\s*atPeriodEnd/);
    assert.match(src, /s === 'past_due'/);
    assert.match(src, /shopAction:\s*'stay_live'/);
    assert.match(src, /reason:\s*'widget_upgrade'/);
    assert.match(src, /onShopLive\s*\(/);
  });

  it('stripeWebhook routes merchant_shop; ignores widget_upgrade for Shops', () => {
    const src = read('entry/src/stripeWebhook.js');
    assert.match(src, /Routes merchant_shop to shops transitions/);
    assert.match(src, /widget_upgrade ignored for Shops/);
    assert.match(src, /applyMerchantShopStripeEvent/);
  });

  it('migration 016 creates ShopInvoices + StripeEvents', () => {
    const mig = read('db/migrations/016_ShopInvoices_StripeEvents.sql');
    assert.match(mig, /CREATE TABLE.*ShopInvoices/s);
    assert.match(mig, /CREATE TABLE.*StripeEvents/s);
  });

  it('FR-239.md Decision LOCKED pins product metadata', () => {
    const doc = read('docs/fr/FR-239.md');
    assert.match(doc, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(doc, /aSearchProduct=merchant_shop/);
    assert.match(doc, /SHOP_MONTHLY_PRICE_ID/);
    assert.match(doc, /past_due/);
    assert.match(doc, /widget_upgrade/);
  });

  it('fr239 suite still asserts checkout + past_due + widget ignore', () => {
    const t = read('tests/fr239-merchant-shop-subscribe.test.js');
    assert.match(t, /startShopSubscribe returns checkoutUrl with merchant_shop metadata/);
    assert.match(t, /cancelShopSubscription calls cancel_at_period_end/);
    assert.match(t, /past_due stays live; unpaid suspends payment; deleted cancels/);
    assert.match(t, /widget_upgrade webhook never touches Shops/);
    assert.match(t, /invoice events upsert ShopInvoices mirror/);
  });
});
