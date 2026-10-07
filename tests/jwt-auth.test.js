'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

const SECRET = 'test-hs256-secret-fr004-do-not-use-in-prod';
const ISSUER = 'https://login.test.invalid/';
const AUDIENCE = 'a-search';

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signHs256(payload, secret = SECRET) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

describe('FR-004 entry JWT verify', () => {
  let verifyAuthorization;
  let AuthError;

  before(() => {
    ({ verifyAuthorization, AuthError } = require('../entry/src/auth/jwt'));
  });

  const env = {
    JWT_ISSUER: ISSUER,
    JWT_AUDIENCE: AUDIENCE,
    JWT_SECRET: SECRET,
  };

  it('fixture token valid → userId', async () => {
    const token = signHs256({
      userId: 'ABC12345',
      iss: ISSUER,
      aud: AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    });
    const result = await verifyAuthorization(`Bearer ${token}`, { env });
    assert.deepEqual(result, { userId: 'ABC12345' });
  });

  it('missing token → unauthorized', async () => {
    await assert.rejects(
      () => verifyAuthorization(undefined, { env }),
      (err) => err instanceof AuthError && err.code === 'unauthorized',
    );
    await assert.rejects(
      () => verifyAuthorization('', { env }),
      (err) => err instanceof AuthError && err.code === 'unauthorized',
    );
    await assert.rejects(
      () => verifyAuthorization('Basic x', { env }),
      (err) => err instanceof AuthError && err.code === 'unauthorized',
    );
  });

  it('missing userId claim → missing_user_id_claim', async () => {
    const token = signHs256({
      sub: 'no-user-id-here',
      iss: ISSUER,
      aud: AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    await assert.rejects(
      () => verifyAuthorization(`Bearer ${token}`, { env }),
      (err) => err instanceof AuthError && err.code === 'missing_user_id_claim',
    );
  });

  it('module never trusts body userId', async () => {
    const src = require('node:fs').readFileSync(
      path.join(__dirname, '..', 'entry', 'src', 'auth', 'jwt.js'),
      'utf8',
    );
    // No code path that reads userId from the request body object.
    assert.doesNotMatch(src, /opts\.body\s*\.\s*userId|body\s*\[\s*['"]userId['"]\s*\]\s*[^=]/);
    assert.match(src, /void opts\.body/);
    // Even if a body is passed, JWT claim wins / body is ignored
    const token = signHs256({
      userId: 'FROM_JWT',
      iss: ISSUER,
      aud: AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const result = await verifyAuthorization(`Bearer ${token}`, {
      env,
      body: { userId: 'FROM_BODY_ATTACKER' },
    });
    assert.deepEqual(result, { userId: 'FROM_JWT' });
  });

  it('bad signature → unauthorized', async () => {
    const token = signHs256(
      {
        userId: 'ABC12345',
        iss: ISSUER,
        aud: AUDIENCE,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      'wrong-secret',
    );
    await assert.rejects(
      () => verifyAuthorization(`Bearer ${token}`, { env }),
      (err) => err instanceof AuthError && err.code === 'unauthorized',
    );
  });

  it('expired token → unauthorized', async () => {
    const token = signHs256({
      userId: 'ABC12345',
      iss: ISSUER,
      aud: AUDIENCE,
      exp: Math.floor(Date.now() / 1000) - 10,
    });
    await assert.rejects(
      () => verifyAuthorization(`Bearer ${token}`, { env }),
      (err) => err instanceof AuthError && err.code === 'unauthorized',
    );
  });
});
