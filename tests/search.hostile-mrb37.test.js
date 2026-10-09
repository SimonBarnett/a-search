'use strict';

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

// FR-114: USER_ID_RE is ^[0-9A-Z]{8}$ - fixture must be 8 chars.
function validToken(userId = 'U1TEST01') {
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

function event({ auth, body }) {
  return {
    httpMethod: 'POST',
    path: '/search',
    headers: auth ? { authorization: auth } : {},
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

const validBody = {
  q: 'widget',
  catalogId: 'c1',
  category: 'cat',
  subcategory: 'sub',
};

describe('MRB #37 hostile: FR-005 accept handler', () => {
  it('valid JWT+body → 200 accepted with searchId userId env enqueued', async () => {
    const res = await handler(
      event({
        auth: `Bearer ${validToken()}`,
        body: { ...validBody, sandbox: true },
      }),
      {},
      {
        env: jwtEnv,
        enqueue: async () => ['amazon'],
      }
    );
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.accepted, true);
    assert.equal(json.userId, 'U1TEST01');
    assert.equal(json.env, 'sandbox');
    assert.match(json.searchId, /^srch_/);
    assert.deepEqual(json.enqueued, ['amazon']);
  });

  it('missing q and searchterms → 400', async () => {
    const res = await handler(
      event({
        auth: `Bearer ${validToken()}`,
        body: { catalogId: 'c1', category: 'cat', subcategory: 'sub' },
      }),
      {},
      { env: jwtEnv }
    );
    assert.equal(res.statusCode, 400);
    const json = JSON.parse(res.body);
    assert.equal(json.accepted, false);
  });

  it('no Authorization → 401', async () => {
    const res = await handler(event({ body: validBody }), {}, { env: jwtEnv });
    assert.equal(res.statusCode, 401);
  });
});
