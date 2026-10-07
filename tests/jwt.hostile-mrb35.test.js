'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { verifyAuthorization, AuthError } = require('../entry/src/auth/jwt');

const FIXTURE_SECRET = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex').toString(
  'utf8'
);

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signHs256(payload, secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

const env = {
  JWT_ISSUER: 'https://login.example.invalid/',
  JWT_AUDIENCE: 'a-search',
  JWT_SECRET: FIXTURE_SECRET,
};

describe('MRB #35 hostile: FR-004 JWT verify', () => {
  it('AuthError codes unauthorized and missing_user_id_claim', async () => {
    await assert.rejects(
      () => verifyAuthorization(undefined, { env }),
      (err) => err instanceof AuthError && err.code === 'unauthorized'
    );
    const token = signHs256(
      { iss: env.JWT_ISSUER, aud: env.JWT_AUDIENCE, exp: Math.floor(Date.now() / 1000) + 60 },
      FIXTURE_SECRET
    );
    await assert.rejects(
      () => verifyAuthorization(`Bearer ${token}`, { env }),
      (err) => err instanceof AuthError && err.code === 'missing_user_id_claim'
    );
  });

  it('JWT_HS256_SECRET alias works when JWT_SECRET unset', async () => {
    const token = signHs256(
      {
        iss: env.JWT_ISSUER,
        aud: env.JWT_AUDIENCE,
        userId: 'ALIAS',
        exp: Math.floor(Date.now() / 1000) + 60,
      },
      FIXTURE_SECRET
    );
    const result = await verifyAuthorization(`Bearer ${token}`, {
      env: {
        JWT_ISSUER: env.JWT_ISSUER,
        JWT_AUDIENCE: env.JWT_AUDIENCE,
        JWT_HS256_SECRET: FIXTURE_SECRET,
      },
    });
    assert.deepEqual(result, { userId: 'ALIAS' });
  });

  it('.env.example still JWT_*/A_SEARCH_ENV only after reconcile', () => {
    const text = fs.readFileSync(path.join(__dirname, '..', 'entry', '.env.example'), 'utf8');
    const assigns = [...text.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]);
    for (const k of assigns) {
      assert.ok(k === 'A_SEARCH_ENV' || k.startsWith('JWT_'), `unexpected ${k}`);
    }
    assert.ok(assigns.includes('JWT_SECRET') || text.includes('JWT_HS256_SECRET'));
  });
});
