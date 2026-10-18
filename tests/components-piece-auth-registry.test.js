'use strict';

/**
 * FR-226 / #1236: Auth provider registry -- pluggable contact claims.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-226.md');
const REGISTRY_JSON = path.join(ROOT, 'shared', 'auth', 'registry.json');

const {
  loadAuthRegistry,
  enabledAuthProviders,
  normalizeAuthClaims,
  AuthContactError,
  getAuthAdapter,
  registerAuthAdapter,
  clearAuthAdapters,
  acceptAuthResult,
} = require('../shared/auth/registry');

describe('FR-226 auth provider registry', () => {
  beforeEach(() => {
    clearAuthAdapters();
  });

  it('docs/fr/FR-226.md Decision LOCKED ASCII no-BOM', () => {
    const buf = fs.readFileSync(FR_DOC);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    for (const b of buf) assert.ok(b < 128, 'FR-226.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /email|phone|contact/i);
    assert.match(text, /fail[- ]?closed|reject/i);
    assert.match(text, /registerAuthAdapter|pluggable/i);
  });

  it('registry.json lists shortlist with enabled flags', () => {
    const data = loadAuthRegistry();
    assert.ok(Array.isArray(data.providers));
    const ids = data.providers.map((p) => p.id);
    for (const id of ['x', 'github', 'facebook', 'google', 'instagram']) {
      assert.ok(ids.includes(id), id);
    }
    for (const p of data.providers) {
      assert.equal(typeof p.enabled, 'boolean');
      assert.equal(typeof p.id, 'string');
    }
    const enabled = enabledAuthProviders();
    assert.ok(Array.isArray(enabled));
    // stay-dark shortlist: none required enabled until credentials exist
    const raw = JSON.parse(fs.readFileSync(REGISTRY_JSON, 'utf8'));
    assert.ok(raw.providers.every((p) => typeof p.enabled === 'boolean'));
  });

  it('add fixture provider without core edit; accept with contact', async () => {
    registerAuthAdapter('fixture_auth', {
      async exchange() {
        return {
          provider: 'fixture_auth',
          subject: 'sub-1',
          email: 'user@example.com',
        };
      },
    });
    const adapter = getAuthAdapter('fixture_auth');
    assert.equal(typeof adapter.exchange, 'function');
    const raw = await adapter.exchange({ code: 'x' });
    const claims = normalizeAuthClaims(raw);
    assert.equal(claims.email, 'user@example.com');
    assert.equal(claims.provider, 'fixture_auth');
    assert.equal(claims.subject, 'sub-1');
    const accepted = acceptAuthResult(raw);
    assert.equal(accepted.email, 'user@example.com');
  });

  it('reject adapter result with no contact fields (fail closed)', () => {
    assert.throws(
      () =>
        normalizeAuthClaims({
          provider: 'x',
          subject: 'sub-2',
        }),
      (err) =>
        err instanceof AuthContactError && err.code === 'contact_required',
    );
    assert.throws(
      () =>
        acceptAuthResult({
          provider: 'x',
          subject: 'sub-2',
          email: '',
          phone: null,
        }),
      /contact_required/,
    );
  });

  it('normalize accepts phone-only or contact-only', () => {
    const phone = normalizeAuthClaims({
      provider: 'x',
      subject: 's',
      phone: '+15551212',
    });
    assert.equal(phone.phone, '+15551212');
    assert.equal(phone.email, undefined);

    const contact = normalizeAuthClaims({
      provider: 'x',
      subject: 's',
      contact: 'handle@x',
    });
    assert.equal(contact.contact, 'handle@x');
  });
});
