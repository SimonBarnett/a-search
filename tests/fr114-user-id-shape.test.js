'use strict';

/** FR-114: shared userId shape + createMerchantUser / JWT validation */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

const {
  USER_ID_RE,
  isValidUserId,
  assertUserId,
  UserIdError,
} = require('../shared/identity/userId');

const {
  createMerchantUser,
  AwinUserError,
} = require('../providers/local/awin/onboarding/src/createMerchantUser');

const FIXTURE_HS256_KEY = Buffer.alloc(32, 0x42).toString('hex');
const ISSUER = 'https://login.test.invalid/';
const AUDIENCE = 'a-search';

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signHs256(payload, key = FIXTURE_HS256_KEY) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = crypto.createHmac('sha256', key).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

describe('FR-114 userId shape helper', () => {
  it('accepts 8-char [0-9A-Z] codes', () => {
    assert.equal(isValidUserId('L7WDZWC8'), true);
    assert.equal(isValidUserId('ABC12345'), true);
    assert.equal(USER_ID_RE.test('GV2K0K7O'), true);
    assert.equal(isValidUserId('usr_test'), false);
    assert.equal(isValidUserId('abc12345'), false);
    assert.equal(isValidUserId('ABC1234'), false);
    assert.equal(isValidUserId('ABC123456'), false);
    assert.throws(() => assertUserId('usr_x'), UserIdError);
    assert.equal(assertUserId('ABC12345'), 'ABC12345');
  });
});

describe('FR-114 createMerchantUser requires generator', () => {
  it('rejects missing newUserId and rejects usr_ shaped ids', async () => {
    const deps = {
      findByEmail: async () => null,
      insertUser: async (row) => row,
    };
    await assert.rejects(
      () => createMerchantUser({ ...deps, email: 'a@b.invalid' }),
      (err) => err instanceof AwinUserError && err.code === 'missing_newUserId',
    );
    await assert.rejects(
      () =>
        createMerchantUser({
          ...deps,
          email: 'a@b.invalid',
          newUserId: () => 'usr_bad',
        }),
      (err) =>
        err instanceof AwinUserError && err.code === 'invalid_user_id',
    );
  });

  it('accepts injected 8-char generator', async () => {
    const store = new Map();
    const { user, created } = await createMerchantUser({
      email: 'm@example.invalid',
      findByEmail: async (e) => store.get(e) || null,
      insertUser: async (row) => {
        store.set(row.email, row);
        return row;
      },
      newUserId: () => 'TESTUSR1',
    });
    assert.equal(created, true);
    assert.equal(user.user_id, 'TESTUSR1');
  });
});

describe('FR-114 JWT userId must be 8-char code', () => {
  it('rejects non-madeira userId claim shapes', async () => {
    const { verifyAuthorization, AuthError } = require('../entry/src/auth/jwt');
    const env = {
      JWT_ISSUER: ISSUER,
      JWT_AUDIENCE: AUDIENCE,
      JWT_SECRET: FIXTURE_HS256_KEY,
    };
    const token = signHs256({
      userId: 'usr_jwt',
      iss: ISSUER,
      aud: AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    await assert.rejects(
      () => verifyAuthorization(`Bearer ${token}`, { env }),
      (err) =>
        err instanceof AuthError &&
        (err.code === 'invalid_user_id_claim' || err.code === 'unauthorized'),
    );
  });
});
