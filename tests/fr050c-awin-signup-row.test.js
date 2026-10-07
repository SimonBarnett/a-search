'use strict';

/** FR-050c: awin onboarding emit signup rows */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  emitSignupRow,
  assertSignupRequiredKeys,
  REQUIRED_KEYS,
  AwinSignupError,
} = require('../providers/local/awin/onboarding/src/emitSignupRow');

describe('FR-050c awin emitSignupRow', () => {
  it('signup includes user_id, company_name, email, advertiserId, env', () => {
    const row = emitSignupRow({
      user_id: 'usr_1',
      company_name: 'Acme Retail',
      email: 'Ops@Acme.Example',
      advertiserId: 1001,
      env: 'sandbox',
      website: 'https://acme.example',
      logoUrl: 'https://cdn.example/acme.png',
      primarySector: 'Retail',
      description: 'Widgets',
      onboardedAt: '2026-10-08T12:00:00.000Z',
    });
    for (const key of REQUIRED_KEYS) {
      assert.ok(row[key] != null && String(row[key]).length > 0, key);
    }
    assert.equal(row.user_id, 'usr_1');
    assert.equal(row.company_name, 'Acme Retail');
    assert.equal(row.email, 'ops@acme.example');
    assert.equal(row.advertiserId, '1001');
    assert.equal(row.env, 'sandbox');
    assert.equal(row.source, 'awin');
    assert.equal(row.onboardedAt, '2026-10-08T12:00:00.000Z');
    assert.equal(assertSignupRequiredKeys(row), true);
  });

  it('rejects missing required fields', () => {
    assert.throws(
      () =>
        emitSignupRow({
          company_name: 'X',
          email: 'a@b.c',
          advertiserId: '1',
          env: 'live',
        }),
      (err) => err instanceof AwinSignupError && err.code === 'missing_user_id',
    );
  });
});
