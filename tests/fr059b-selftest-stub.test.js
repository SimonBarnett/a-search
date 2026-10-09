'use strict';

/** FR-059b: selftest route — JWT required; env from body/default (FR-152 fills providers) */

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

function selftestEvent({ method = 'GET', auth, body, query } = {}) {
  return {
    httpMethod: method,
    path: '/selftest',
    rawPath: '/selftest',
    headers: auth ? { authorization: auth } : {},
    queryStringParameters: query || null,
    body: body != null ? JSON.stringify(body) : undefined,
  };
}

describe('FR-059b selftest route stub', () => {
  it('401 without JWT', async () => {
    const res = await handler(selftestEvent({ auth: null }), {}, { env: jwtEnv });
    assert.equal(res.statusCode, 401);
    const json = JSON.parse(res.body);
    assert.equal(json.ok, false);
    assert.equal(json.error, 'unauthorized');
  });

  it('200 providers shape scoped to JWT userId (default live)', async () => {
    const res = await handler(
      selftestEvent({
        method: 'GET',
        auth: `Bearer ${validToken('JWTUSER1')}`,
      }),
      {},
      {
        env: jwtEnv,
        // Auth-focused pin: empty enabled set so FR-059b stays independent of probes.
        listEnabled: () => [],
        probe: async () => {
          throw new Error('probe must not run when listEnabled is empty');
        },
        reportSelftestFailures: async () => ({ intakeFiled: [] }),
      },
    );
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.ok, true);
    assert.equal(json.userId, 'JWTUSER1');
    assert.equal(json.env, 'live');
    assert.ok(Array.isArray(json.providers));
    assert.equal(json.providers.length, 0);
    assert.ok(Array.isArray(json.failed));
    assert.equal(json.failed.length, 0);
    assert.ok(Array.isArray(json.intakeFiled));
    assert.equal(json.intakeFiled.length, 0);
  });

  it('body userId cannot override JWT (401)', async () => {
    const res = await handler(
      selftestEvent({
        method: 'POST',
        auth: `Bearer ${validToken('JWTUSER1')}`,
        body: { userId: 'ATTACKER', sandbox: false },
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
      selftestEvent({
        method: 'POST',
        auth: `Bearer ${validToken('USER0001')}`,
        body: { sandbox: true },
      }),
      {},
      {
        env: jwtEnv,
        listEnabled: () => [],
        reportSelftestFailures: async () => ({ intakeFiled: [] }),
      },
    );
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.userId, 'USER0001');
    assert.equal(json.env, 'sandbox');
    assert.deepEqual(json.providers, []);
  });

  it('GET sandbox=true query stamps env sandbox', async () => {
    const res = await handler(
      selftestEvent({
        method: 'GET',
        auth: `Bearer ${validToken('USER0002')}`,
        query: { sandbox: 'true' },
      }),
      {},
      {
        env: jwtEnv,
        listEnabled: () => [],
        reportSelftestFailures: async () => ({ intakeFiled: [] }),
      },
    );
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.env, 'sandbox');
  });

  it('CDK stack wires /selftest to entry', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(text, /\/selftest/);
    assert.match(text, /EntrySelftestIntegration/);
    assert.match(text, /HttpMethod\.GET/);
  });
});
