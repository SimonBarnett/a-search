'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
describe('docs/mrb-2186 hostile FR-246 pins', () => {
  it('adapter POST form token/{store_id}; ignores public_token', () => {
    const src = read('shared/shops/adapters/ecwid.js');
    assert.match(src, /api\/oauth\/token/);
    assert.match(src, /application\/x-www-form-urlencoded/);
    assert.match(src, /store_id_required/);
    assert.match(src, /Ignore public_token|public_token/);
  });
  it('webhook verifies X-Ecwid-Webhook-Signature HMAC', () => {
    const src = read('entry/src/ecwidWebhooks.js');
    assert.match(src, /X-Ecwid-Webhook-Signature/);
    assert.match(src, /uninstalled|application\.uninstalled/);
    assert.match(src, /cancelSubscription/);
  });
  it('registry stay-dark both envs; merchantConnect true', () => {
    const reg = JSON.parse(read('providers/registry.json'));
    const row = (reg.sources || reg).find((s) => s.id === 'ecwid');
    assert.ok(row);
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
    assert.equal(row.merchantConnect, true);
  });
  it('FR-246.md Decision LOCKED pins POST form + store_id + signature', () => {
    const doc = read('docs/fr/FR-246.md');
    assert.match(doc, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(doc, /store_id/);
    assert.match(doc, /application\/x-www-form-urlencoded/);
    assert.match(doc, /X-Ecwid-Webhook-Signature/);
    assert.match(doc, /stay-dark/);
  });
  it('fr246 suite asserts pending_payment + form token + signature', () => {
    const t = read('tests/fr246-ecwid-connect.test.js');
    assert.match(t, /pending_payment/);
    assert.match(t, /oauth\/token/);
    assert.match(t, /X-Ecwid-Webhook-Signature/);
  });
});
