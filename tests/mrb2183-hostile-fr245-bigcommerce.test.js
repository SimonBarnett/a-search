'use strict';

/**
 * docs/mrb-2183: hostile contiguous pins for FR-245 BigCommerce OAuth connect.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('docs/mrb-2183 hostile FR-245 pins', () => {
  it('adapter verifies signed_payload_jwt HS256 and exchanges OAuth token', () => {
    const src = read('shared/shops/adapters/bigcommerce.js');
    assert.match(src, /signed_payload_jwt/);
    assert.match(src, /HS256/);
    assert.match(src, /login\.bigcommerce\.com\/oauth2\/token/);
    assert.match(src, /X-Auth-Token/);
    assert.match(src, /context_required|storeHashFromContext/);
  });

  it('webhooks Load/Uninstall suspend uninstalled + cancel stub', () => {
    const src = read('entry/src/bigcommerceWebhooks.js');
    assert.match(src, /matchBigCommerceWebhookRoute/);
    assert.match(src, /\/webhooks\/shop\/bigcommerce/);
    assert.match(src, /reason:\s*'uninstalled'/);
    assert.match(src, /cancelSubscription/);
  });

  it('registry stay-dark both envs; merchantConnect true', () => {
    const reg = JSON.parse(read('providers/registry.json'));
    const row = (reg.sources || reg).find((s) => s.id === 'bigcommerce');
    assert.ok(row);
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
    assert.equal(row.merchantConnect, true);
    assert.equal(row.class, 'merchant');
  });

  it('FR-245.md Decision LOCKED pins HS256 + non-expiring token + no migrate', () => {
    const doc = read('docs/fr/FR-245.md');
    assert.match(doc, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(doc, /signed_payload_jwt/);
    assert.match(doc, /HS256/);
    assert.match(doc, /non-expiring/i);
    assert.match(doc, /No migrate-legacy-bigcommerce|no migrate/i);
    assert.match(doc, /stay-dark/);
  });

  it('fr245 suite asserts pending_payment + JWT + uninstall', () => {
    const t = read('tests/fr245-bigcommerce-connect.test.js');
    assert.match(t, /pending_payment/);
    assert.match(t, /signed_payload_jwt|HS256/i);
    assert.match(t, /uninstalled|uninstall/i);
  });

  it('onboarding skill has CAST IRON harvest to SimonBarnett/a-search', () => {
    const text = read(
      'providers/local/bigcommerce/.grok/skills/a-search-bigcommerce-onboarding/SKILL.md',
    );
    assert.match(text, /CAST IRON/i);
    assert.match(text, /SimonBarnett\/a-search/);
    assert.match(text, /\/bob\/v1\/intake/);
  });
});
