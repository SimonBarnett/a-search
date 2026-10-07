'use strict';

/** FR-048c: entry fatal catch calls reportException once */

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

const validBody = {
  q: 'noise cancelling headphones',
  catalogId: 123,
  category: 'Electronics',
  subcategory: 'Headphones',
};

describe('FR-048c entry fatal → intake', () => {
  it('entry/src/index.js requires shared reportException', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'entry', 'src', 'index.js'),
      'utf8',
    );
    assert.match(src, /shared\/intake\/reportException/);
    assert.match(src, /reportException/);
  });

  it('fatal enqueue path invokes reporter once and returns 500', async () => {
    const reports = [];
    const fatal = new Error('sqs exploded');
    fatal.code = 'sqs_boom';

    const res = await handler(
      {
        httpMethod: 'POST',
        path: '/search',
        headers: { authorization: `Bearer ${validToken()}` },
        body: JSON.stringify(validBody),
      },
      {},
      {
        env: jwtEnv,
        enqueue: async () => {
          throw fatal;
        },
        reportException: async (opts) => {
          reports.push(opts);
          return { ok: true, payload: { idempotency_key: 't' } };
        },
      },
    );

    assert.equal(res.statusCode, 500);
    const json = JSON.parse(res.body);
    assert.equal(json.accepted, false);
    assert.equal(json.error, 'internal_error');
    assert.equal(reports.length, 1);
    assert.equal(reports[0].err, fatal);
    assert.equal(reports[0].route, 'entry/POST /search');
    assert.equal(reports[0].source, 'entry');
  });

  it('AuthError 401 does not call reporter', async () => {
    const reports = [];
    const res = await handler(
      {
        httpMethod: 'POST',
        path: '/search',
        headers: {},
        body: JSON.stringify(validBody),
      },
      {},
      {
        env: jwtEnv,
        reportException: async (opts) => {
          reports.push(opts);
        },
      },
    );
    assert.equal(res.statusCode, 401);
    assert.equal(reports.length, 0);
  });
  it('EnqueueError 400 does not call reporter', async () => {
    const { EnqueueError } = require('../entry/src/enqueue');
    const reports = [];
    const res = await handler(
      {
        httpMethod: 'POST',
        path: '/search',
        headers: { authorization: `Bearer ${validToken()}` },
        body: JSON.stringify(validBody),
      },
      {},
      {
        env: jwtEnv,
        enqueue: async () => {
          throw new EnqueueError('sources_not_enabled', 'no sources', ['sources']);
        },
        reportException: async (opts) => {
          reports.push(opts);
        },
      },
    );
    assert.equal(res.statusCode, 400);
    assert.equal(reports.length, 0);
  });

});
