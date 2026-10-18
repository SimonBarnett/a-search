'use strict';

/**
 * FR-227 / #1237: OAuth shortlist adapter scaffolds (stay-dark).
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-227.md');
const REGISTRY_JSON = path.join(ROOT, 'shared', 'auth', 'registry.json');

const {
  loadAuthRegistry,
  enabledAuthProviders,
  registerAuthAdapter,
  getAuthAdapter,
  clearAuthAdapters,
  acceptAuthResult,
  AuthContactError,
} = require('../shared/auth/registry');

const {
  SHORTLIST_IDS,
  secretNamesFor,
  createFixtureAdapter,
  registerShortlistAdapters,
} = require('../shared/auth/adapters');

describe('FR-227 OAuth shortlist adapter scaffolds', () => {
  beforeEach(() => {
    clearAuthAdapters();
  });

  it('docs/fr/FR-227.md Decision LOCKED ASCII no-BOM', () => {
    const buf = fs.readFileSync(FR_DOC);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    for (const b of buf) assert.ok(b < 128, 'FR-227.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /stay-dark|enabled:\s*false/i);
    assert.match(text, /Secrets Manager|secret name/i);
    assert.match(text, /email|phone|contact/i);
    assert.match(text, /fail[- ]?closed/i);
  });

  it('registry lists five shortlist ids all stay-dark', () => {
    const data = loadAuthRegistry();
    const ids = data.providers.map((p) => p.id);
    for (const id of SHORTLIST_IDS) {
      assert.ok(ids.includes(id), id);
    }
    assert.deepEqual([...SHORTLIST_IDS].sort(), [
      'facebook',
      'github',
      'google',
      'instagram',
      'x',
    ]);
    const raw = JSON.parse(fs.readFileSync(REGISTRY_JSON, 'utf8'));
    for (const id of SHORTLIST_IDS) {
      const row = raw.providers.find((p) => p.id === id);
      assert.ok(row, id);
      assert.equal(row.enabled, false, id + ' stay-dark');
    }
    assert.equal(enabledAuthProviders().length, 0);
  });

  it('Secrets Manager key names only (no secret values in git)', () => {
    for (const id of SHORTLIST_IDS) {
      const names = secretNamesFor(id);
      assert.equal(names.clientId, `a-search/auth/${id}/client-id`);
      assert.equal(names.clientSecret, `a-search/auth/${id}/client-secret`);
      assert.ok(!Object.values(names).some((v) => /sk_|AKIA|ghp_/.test(v)));
    }
    const secretsSrc = fs.readFileSync(
      path.join(ROOT, 'shared', 'auth', 'secrets.js'),
      'utf8',
    );
    assert.doesNotMatch(secretsSrc, /sk_live|sk_test|ghp_[A-Za-z0-9]/);
    assert.match(secretsSrc, /a-search\/auth\//);
  });

  it('fixture profile with email accepts; empty contact rejects', async () => {
    registerShortlistAdapters({ mode: 'fixture' });
    for (const id of SHORTLIST_IDS) {
      const adapter = getAuthAdapter(id);
      assert.equal(typeof adapter.exchange, 'function');
      const ok = await adapter.exchange({
        code: 'fixture',
        profile: { email: `${id}@example.com`, subject: `${id}-sub` },
      });
      const claims = acceptAuthResult(ok);
      assert.equal(claims.provider, id);
      assert.equal(claims.email, `${id}@example.com`);
      assert.equal(claims.subject, `${id}-sub`);

      await assert.rejects(
        () =>
          adapter.exchange({
            code: 'fixture',
            profile: { subject: `${id}-empty` },
          }),
        (err) =>
          err instanceof AuthContactError && err.code === 'contact_required',
      );
    }
  });

  it('createFixtureAdapter registers without editing registry.js', () => {
    const before = fs.readFileSync(
      path.join(ROOT, 'shared', 'auth', 'registry.js'),
      'utf8',
    );
    registerAuthAdapter(
      'fr227_extra',
      createFixtureAdapter('fr227_extra'),
    );
    const adapter = getAuthAdapter('fr227_extra');
    assert.equal(typeof adapter.exchange, 'function');
    const after = fs.readFileSync(
      path.join(ROOT, 'shared', 'auth', 'registry.js'),
      'utf8',
    );
    assert.equal(before, after, 'core registry.js unchanged');
  });
});
