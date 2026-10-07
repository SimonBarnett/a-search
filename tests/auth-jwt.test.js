'use strict';

/**
 * FR-027 / vision S5: JWT userId drives search; body cannot override.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { handler } = require('../entry/src/index');

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

function validToken(userId = 'ABC12345') {
  return signHs256({
    userId,
    iss: ISSUER,
    aud: AUDIENCE,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}

const jwtEnv = {
  JWT_ISSUER: ISSUER,
  JWT_AUDIENCE: AUDIENCE,
  JWT_SECRET: FIXTURE_HS256_KEY,
};

const validBody = {
  q: 'headphones',
  catalogId: 123,
  category: 'Electronics',
  subcategory: 'Headphones',
};

function event({ auth, body }) {
  return {
    httpMethod: 'POST',
    path: '/search',
    headers: auth ? { authorization: auth } : {},
    body: JSON.stringify(body),
  };
}

describe('FR-027 / S5 auth-jwt (body cannot override JWT userId)', () => {
  it('body userId differing from JWT → 401 unauthorized', async () => {
    const res = await handler(
      event({
        auth: `Bearer ${validToken('FROM_JWT')}`,
        body: { ...validBody, userId: 'FROM_BODY_ATTACKER' },
      }),
      {},
      { env: jwtEnv, enqueue: async () => [] },
    );
    assert.equal(res.statusCode, 401);
    const json = JSON.parse(res.body);
    assert.equal(json.accepted, false);
    assert.equal(json.error, 'unauthorized');
  });

  it('matching body userId still accepts JWT claim only', async () => {
    const res = await handler(
      event({
        auth: `Bearer ${validToken('ABC12345')}`,
        body: { ...validBody, userId: 'ABC12345' },
      }),
      {},
      { env: jwtEnv, enqueue: async () => ['amazon'] },
    );
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.userId, 'ABC12345');
  });

  it('missing Authorization → 401', async () => {
    const res = await handler(
      event({ auth: null, body: validBody }),
      {},
      { env: jwtEnv },
    );
    assert.equal(res.statusCode, 401);
  });
});
