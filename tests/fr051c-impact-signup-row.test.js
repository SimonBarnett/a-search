'use strict';

/** FR-051c: impact onboarding emit signup rows (Awin schema subset) */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  emitSignupRow,
  assertSignupRequiredKeys,
  REQUIRED_KEYS,
  ImpactSignupError,
} = require('../providers/local/impact/onboarding/src/emitSignupRow');

const {
  runOnce,
  createMemoryPendingQueue,
} = require('../providers/local/impact/onboarding/src/run');

/** Awin FR-050c required keys — Impact must match this subset. */
const AWIN_REQUIRED = [
  'user_id',
  'company_name',
  'email',
  'advertiserId',
  'env',
];

describe('FR-051c impact emitSignupRow', () => {
  it('REQUIRED_KEYS match Awin schema subset', () => {
    assert.deepEqual([...REQUIRED_KEYS], AWIN_REQUIRED);
  });

  it('signup includes user_id, company_name, email, advertiserId, env', () => {
    const row = emitSignupRow({
      user_id: 'IMPACT01',
      company_name: 'Impact Retail',
      email: 'Ops@Impact.Example',
      advertiserId: 2002,
      env: 'sandbox',
      website: 'https://impact.example',
      onboardedAt: '2026-10-08T12:00:00.000Z',
    });
    for (const key of REQUIRED_KEYS) {
      assert.ok(row[key] != null && String(row[key]).length > 0, key);
    }
    assert.equal(row.user_id, 'IMPACT01');
    assert.equal(row.company_name, 'Impact Retail');
    assert.equal(row.email, 'ops@impact.example');
    assert.equal(row.advertiserId, '2002');
    assert.equal(row.env, 'sandbox');
    assert.equal(row.source, 'impact');
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
      (err) =>
        err instanceof ImpactSignupError && err.code === 'missing_user_id',
    );
  });

  it('runOnce emits signup rows matching required keys when draining', async () => {
    const q = createMemoryPendingQueue([
      {
        Id: 7,
        Env: 'sandbox',
        MerchantId: 'camp-7',
        MerchantName: 'Camp Seven',
        Status: 'pending',
      },
    ]);
    const out = await runOnce({
      envVars: { A_SEARCH_ENV: 'sandbox' },
      newUserId: () => 'IMPACT02',
      ...q,
    });
    assert.equal(out.processed, 1);
    assert.equal(out.remaining, 0);
    assert.equal(out.signups.length, 1);
    const row = out.signups[0];
    assert.equal(assertSignupRequiredKeys(row), true);
    assert.equal(row.source, 'impact');
    assert.equal(row.advertiserId, 'camp-7');
    assert.equal(row.company_name, 'Camp Seven');
    assert.equal(row.user_id, 'IMPACT02');
    assert.equal(row.env, 'sandbox');
  });
});
