'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { handler, validateSearchBody, newSearchId } = require('../entry/src/index');
const { AuthError } = require('../entry/src/auth/jwt');

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

function event({ auth, body }) {
  return {
    httpMethod: 'POST',
    path: '/search',
    headers: auth ? { authorization: auth } : {},
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

const validBody = {
  q: 'noise cancelling headphones',
  catalogId: 123,
  category: 'Electronics',
  subcategory: 'Headphones',
};

describe('FR-005 POST /search accept', () => {
  it('Valid JWT+body → 200 accepted', async () => {
    const enqueued = ['amazon', 'ebay'];
    const res = await handler(
      event({ auth: `Bearer ${validToken()}`, body: validBody }),
      {},
      {
        env: jwtEnv,
        enqueue: async () => enqueued,
      },
    );
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.accepted, true);
    assert.equal(json.userId, 'ABC12345');
    assert.equal(json.env, 'live');
    assert.deepEqual(json.enqueued, enqueued);
    assert.match(json.searchId, /^srch_/);
  });

  it('sandbox:true stamps env sandbox', async () => {
    const res = await handler(
      event({
        auth: `Bearer ${validToken()}`,
        body: { ...validBody, sandbox: true },
      }),
      {},
      { env: jwtEnv, enqueue: async () => [] },
    );
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).env, 'sandbox');
  });

  it('Missing q and searchterms → 400', async () => {
    const res = await handler(
      event({
        auth: `Bearer ${validToken()}`,
        body: {
          catalogId: 123,
          category: 'Electronics',
          subcategory: 'Headphones',
        },
      }),
      {},
      { env: jwtEnv },
    );
    assert.equal(res.statusCode, 400);
    const json = JSON.parse(res.body);
    assert.equal(json.accepted, false);
    assert.equal(json.error, 'missing_required_field');
    assert.ok(json.fields.includes('q') || json.fields.includes('searchterms'));
  });

  it('No Authorization → 401', async () => {
    const res = await handler(event({ body: validBody }), {}, { env: jwtEnv });
    assert.equal(res.statusCode, 401);
    const json = JSON.parse(res.body);
    assert.equal(json.accepted, false);
    assert.equal(json.error, 'unauthorized');
  });

  it('validateSearchBody requires catalogId category subcategory', () => {
    const r = validateSearchBody({ q: 'x' });
    assert.equal(r.ok, false);
    assert.ok(r.fields.includes('catalogId'));
    assert.ok(r.fields.includes('category'));
    assert.ok(r.fields.includes('subcategory'));
  });

  it('newSearchId is stable-prefixed', () => {
    assert.match(newSearchId(), /^srch_[a-z0-9]+$/i);
  });

  it('AuthError missing_user_id_claim → 401 with that error', async () => {
    const res = await handler(
      event({ auth: 'Bearer x', body: validBody }),
      {},
      {
        env: jwtEnv,
        verifyAuthorization: async () => {
          throw new AuthError('missing_user_id_claim');
        },
      },
    );
    assert.equal(res.statusCode, 401);
    assert.equal(JSON.parse(res.body).error, 'missing_user_id_claim');
  });
});
