'use strict';

/**
 * FR-026 / vision S1: Accept → enqueue harness.
 * Fake JWT + mock SQS; HTTP 200, searchId, message count = enabled sources.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { handler } = require('../entry/src/index');
const { fanOutEnqueue } = require('../entry/src/enqueue');
const { enabled: registryEnabled } = require('../providers/loadRegistry');

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

describe('FR-026 fan-out integration (vision S1)', () => {
  it('Valid JWT + mock SQS → 200, searchId, messages = enabled(live)', async () => {
    const enabledLive = registryEnabled('live');
    assert.ok(enabledLive.length >= 1, 'registry must enable at least one live source');

    const sent = [];
    const res = await handler(
      event({ auth: `Bearer ${validToken()}`, body: validBody }),
      {},
      {
        env: jwtEnv,
        sendMessage: async (payload) => {
          sent.push(payload);
        },
      },
    );

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.accepted, true);
    assert.equal(json.userId, 'ABC12345');
    assert.equal(json.env, 'live');
    assert.match(json.searchId, /^srch_/);
    assert.equal(sent.length, enabledLive.length);
    assert.equal(json.enqueued.length, enabledLive.length);
    assert.deepEqual([...json.enqueued].sort(), [...enabledLive].sort());
    for (const p of sent) {
      assert.equal(p.searchId, json.searchId);
      assert.equal(p.userId, 'ABC12345');
      assert.equal(p.env, 'live');
      assert.ok(enabledLive.includes(p.source));
      assert.equal(p.queueName, `a-search-${p.source}-live`);
    }
  });

  it('sandbox:true → messages = enabled(sandbox) via mock registry', async () => {
    const mockOn = ['amazon', 'ebay'];
    const sent = [];
    const res = await handler(
      event({
        auth: `Bearer ${validToken('U-SBOX')}`,
        body: { ...validBody, sandbox: true },
      }),
      {},
      {
        env: jwtEnv,
        enqueue: (args) =>
          fanOutEnqueue({
            ...args,
            enabled: () => [...mockOn],
            sendMessage: async (payload) => {
              sent.push(payload);
            },
          }),
      },
    );

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.env, 'sandbox');
    assert.match(json.searchId, /^srch_/);
    assert.equal(sent.length, mockOn.length);
    assert.deepEqual(json.enqueued, mockOn);
    for (const p of sent) {
      assert.equal(p.env, 'sandbox');
      assert.equal(p.sandbox, true);
      assert.equal(p.queueName, `a-search-${p.source}-sandbox`);
    }
  });

  it('mock registry empty → 200 with zero SQS messages', async () => {
    const sent = [];
    const res = await handler(
      event({ auth: `Bearer ${validToken()}`, body: validBody }),
      {},
      {
        env: jwtEnv,
        enqueue: (args) =>
          fanOutEnqueue({
            ...args,
            enabled: () => [],
            sendMessage: async (payload) => {
              sent.push(payload);
            },
          }),
      },
    );
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.accepted, true);
    assert.match(json.searchId, /^srch_/);
    assert.deepEqual(json.enqueued, []);
    assert.equal(sent.length, 0);
  });
});
