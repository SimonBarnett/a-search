'use strict';

/**
 * MRB #2006 docs/hostile: FR-227 OAuth shortlist scaffolds + FR-226 registry.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const {
  clearAuthAdapters,
  getAuthAdapter,
  acceptAuthResult,
  AuthContactError,
  enabledAuthProviders,
  loadAuthRegistry,
} = require('../shared/auth/registry');

const {
  SHORTLIST_IDS,
  secretNamesFor,
  registerShortlistAdapters,
  createFixtureAdapter,
} = require('../shared/auth/adapters');

function asciiNoBom(rel) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  assert.notEqual(buf[0], 0xef, `${rel} BOM`);
  for (const b of buf) assert.ok(b < 128, `${rel} ASCII`);
  return buf.toString('utf8');
}

describe('MRB #2006 hostile FR-227 OAuth scaffolds', () => {
  beforeEach(() => {
    clearAuthAdapters();
  });

  it('FR-226+227 Decision LOCKED; shortlist stay-dark; SM names only', () => {
    const fr226 = asciiNoBom('docs/fr/FR-226.md');
    const fr227 = asciiNoBom('docs/fr/FR-227.md');
    assert.match(fr226, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(fr227, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(fr227, /stay-dark|enabled:\s*false/i);
    assert.match(fr227, /a-search\/auth\//);

    const reg = loadAuthRegistry();
    for (const id of SHORTLIST_IDS) {
      const row = reg.providers.find((p) => p.id === id);
      assert.ok(row, id);
      assert.equal(row.enabled, false);
      const names = secretNamesFor(id);
      assert.equal(names.clientId, `a-search/auth/${id}/client-id`);
      assert.equal(names.clientSecret, `a-search/auth/${id}/client-secret`);
    }
    assert.equal(enabledAuthProviders().length, 0);
  });

  it('registerShortlistAdapters: email accepts; empty contact fail-closed', async () => {
    registerShortlistAdapters({ mode: 'fixture' });
    const adapter = getAuthAdapter('github');
    const ok = await adapter.exchange({
      code: 'x',
      profile: { email: 'g@example.com', subject: 'g1' },
    });
    assert.equal(acceptAuthResult(ok).email, 'g@example.com');
    await assert.rejects(
      () => adapter.exchange({ code: 'x', profile: { subject: 'g2' } }),
      (err) => err instanceof AuthContactError && err.code === 'contact_required',
    );
    // pluggable without core edit
    const before = fs.readFileSync(
      path.join(ROOT, 'shared', 'auth', 'registry.js'),
      'utf8',
    );
    createFixtureAdapter; // referenced
    const { registerAuthAdapter } = require('../shared/auth/registry');
    registerAuthAdapter('mrb2006_extra', createFixtureAdapter('mrb2006_extra'));
    assert.equal(typeof getAuthAdapter('mrb2006_extra').exchange, 'function');
    assert.equal(
      before,
      fs.readFileSync(path.join(ROOT, 'shared', 'auth', 'registry.js'), 'utf8'),
    );
  });

  it('shared package packs auth/; vision AL1 OAuth mock exists', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'shared', 'package.json'), 'utf8'),
    );
    assert.ok(pkg.files.includes('auth/'));
    assert.ok(
      fs.existsSync(
        path.join(ROOT, 'docs', 'mocks', 'components-piece-auth', 'home.html'),
      ),
    );
  });
});
