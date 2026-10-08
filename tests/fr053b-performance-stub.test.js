'use strict';

/** FR-053b: performance route stub — JWT userId only; empty payload */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

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

function perfEvent({ method = 'GET', auth, body, query } = {}) {
  return {
    httpMethod: method,
    path: '/account/performance',
    rawPath: '/account/performance',
    headers: auth ? { authorization: auth } : {},
    queryStringParameters: query || null,
    body: body != null ? JSON.stringify(body) : undefined,
  };
}

describe('FR-053b performance route stub', () => {
  it('401 without JWT', async () => {
    const res = await handler(perfEvent({ auth: null }), {}, { env: jwtEnv });
    assert.equal(res.statusCode, 401);
    const json = JSON.parse(res.body);
    assert.equal(json.ok, false);
    assert.equal(json.error, 'unauthorized');
  });

  it('200 empty shape scoped to JWT userId', async () => {
    const res = await handler(
      perfEvent({
        method: 'GET',
        auth: `Bearer ${validToken('FROM_JWT')}`,
        query: { from: '2026-10-01', to: '2026-10-08' },
      }),
      {},
      { env: jwtEnv },
    );
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.ok, true);
    assert.equal(json.userId, 'FROM_JWT');
    assert.equal(json.env, 'live');
    assert.equal(json.from, '2026-10-01');
    assert.equal(json.to, '2026-10-08');
    assert.equal(json.clicks, 0);
    assert.equal(json.visits, 0);
    assert.equal(json.uniqueVisitors, 0);
    assert.equal(json.sales.count, 0);
    assert.equal(json.sales.amount, 0);
    assert.equal(json.sales.commission, 0);
    assert.ok(Array.isArray(json.currencies));
    assert.ok(Array.isArray(json.topLinks));
    assert.ok(Array.isArray(json.topMerchants));
  });

  it('body userId cannot override JWT (401)', async () => {
    const res = await handler(
      perfEvent({
        method: 'POST',
        auth: `Bearer ${validToken('FROM_JWT')}`,
        body: {
          userId: 'ATTACKER',
          from: '2026-10-01',
          to: '2026-10-08',
        },
      }),
      {},
      { env: jwtEnv },
    );
    assert.equal(res.statusCode, 401);
    const json = JSON.parse(res.body);
    assert.equal(json.ok, false);
    assert.equal(json.error, 'user_id_mismatch');
  });

  it('POST sandbox=true stamps env sandbox', async () => {
    const res = await handler(
      perfEvent({
        method: 'POST',
        auth: `Bearer ${validToken('U1')}`,
        body: { sandbox: true, from: '2026-10-01', to: '2026-10-01' },
      }),
      {},
      { env: jwtEnv },
    );
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.userId, 'U1');
    assert.equal(json.env, 'sandbox');
  });

  it('CDK stack wires /account/performance to entry', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(text, /\/account\/performance/);
    assert.match(text, /EntryPerformanceIntegration/);
    assert.match(text, /HttpMethod\.GET/);
  });
});
