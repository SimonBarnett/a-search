'use strict';

/** FR-053e: performance top links/merchants — array present; scoped to userId */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  aggregateTop,
  aggregateTopEvents,
} = require('../entry/src/performanceTop');
const { handler } = require('../entry/src/index');

const fixturePath = path.join(__dirname, 'fixtures', 'performance-top.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

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

function validToken(userId = 'FROM_JWT') {
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

describe('FR-053e performance top links/merchants', () => {
  it('top arrays match fixture and are scoped to userId', async () => {
    const exp = fixture.expected;
    const got = await aggregateTop({
      userId: exp.userId,
      env: exp.env,
      from: exp.from,
      to: exp.to,
      limit: exp.limit,
      events: fixture.events,
    });
    assert.deepEqual(got.topLinks, exp.topLinks);
    assert.deepEqual(got.topMerchants, exp.topMerchants);
    assert.ok(got.topLinks.every((x) => x.linkId !== 'lnk_other'));
    assert.ok(got.topMerchants.every((x) => x.merchantId !== 'm_other'));
  });

  it('excludes other userId and other env', () => {
    const got = aggregateTopEvents(fixture.events, {
      userId: 'FROM_JWT',
      env: 'live',
      from: '2026-10-01',
      to: '2026-10-08',
      limit: 10,
    });
    assert.equal(got.topLinks.length, 2);
    assert.equal(got.topMerchants.length, 2);
  });

  it('handler 200 includes topLinks and topMerchants arrays for JWT userId', async () => {
    const exp = fixture.expected;
    const res = await handler(
      {
        httpMethod: 'GET',
        path: '/account/performance',
        rawPath: '/account/performance',
        headers: { authorization: `Bearer ${validToken(exp.userId)}` },
        queryStringParameters: { from: '2026-10-01', to: '2026-10-08' },
      },
      {},
      {
        env: jwtEnv,
        topEvents: fixture.events,
        topLimit: exp.limit,
      },
    );
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.userId, exp.userId);
    assert.ok(Array.isArray(json.topLinks));
    assert.ok(Array.isArray(json.topMerchants));
    assert.deepEqual(json.topLinks, exp.topLinks);
    assert.deepEqual(json.topMerchants, exp.topMerchants);
  });

  it('empty events → empty arrays', async () => {
    const got = await aggregateTop({
      userId: 'FROM_JWT',
      env: 'live',
      events: [],
    });
    assert.deepEqual(got, { topLinks: [], topMerchants: [] });
  });
});
