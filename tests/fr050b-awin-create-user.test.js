'use strict';

/** FR-050b: idempotent merchant user create by email */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  createMerchantUser,
  AwinUserError,
} = require('../providers/local/awin/onboarding/src/createMerchantUser');

describe('FR-050b awin createMerchantUser', () => {
  it('creates user once; second run skips duplicate', async () => {
    /** @type {Map<string, object>} */
    const store = new Map();
    let inserts = 0;

    const deps = {
      findByEmail: async (email) => store.get(email) || null,
      insertUser: async (row) => {
        inserts += 1;
        store.set(row.email, row);
        return row;
      },
      newUserId: () => 'TESTUSR1',
    };

    const first = await createMerchantUser({
      ...deps,
      email: 'Merchant@Example.COM',
      companyName: 'Acme',
      advertiserId: '1001',
      env: 'sandbox',
    });
    assert.equal(first.created, true);
    assert.equal(first.user.email, 'merchant@example.com');
    assert.equal(first.user.user_id, 'TESTUSR1');
    assert.equal(inserts, 1);

    const second = await createMerchantUser({
      ...deps,
      email: 'merchant@example.com',
      companyName: 'Acme Again',
      advertiserId: '1001',
      env: 'sandbox',
    });
    assert.equal(second.created, false);
    assert.equal(second.user.user_id, 'TESTUSR1');
    assert.equal(inserts, 1);
    assert.equal(store.size, 1);
  });

  it('rejects invalid email', async () => {
    await assert.rejects(
      () =>
        createMerchantUser({
          email: 'not-an-email',
          findByEmail: async () => null,
          insertUser: async (r) => r,
        }),
      (err) => err instanceof AwinUserError && err.code === 'invalid_email',
    );
  });
});
