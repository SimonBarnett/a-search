'use strict';

/** FR-053d: performance sales/commission aggregate */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  aggregateSales,
  aggregateSaleEvents,
} = require('../entry/src/performanceSales');
const { handler } = require('../entry/src/index');

const fixturePath = path.join(__dirname, 'fixtures', 'performance-sales.json');
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

describe('FR-053d performance sales/commission aggregate', () => {
  it('sales totals match fixture expected', async () => {
    const exp = fixture.expected;
    const got = await aggregateSales({
      userId: exp.userId,
      env: exp.env,
      from: exp.from,
      to: exp.to,
      events: fixture.events,
    });
    assert.equal(got.sales.count, exp.sales.count);
    assert.equal(got.sales.amount, exp.sales.amount);
    assert.equal(got.sales.commission, exp.sales.commission);
    assert.equal(got.sales.currency, exp.sales.currency);
    assert.deepEqual(got.currencies, exp.currencies);
  });

  it('excludes other userId / env / out-of-range', () => {
    const got = aggregateSaleEvents(fixture.events, {
      userId: 'FROM_JWT',
      env: 'live',
      from: '2026-10-01',
      to: '2026-10-08',
    });
    assert.equal(got.sales.count, 3);
  });

  it('handler 200 includes sales totals from injected events', async () => {
    const exp = fixture.expected;
    const res = await handler(
      {
        httpMethod: 'GET',
        path: '/account/performance',
        rawPath: '/account/performance',
        headers: { authorization: `Bearer ${validToken(exp.userId)}` },
        queryStringParameters: { from: exp.from, to: exp.to },
      },
      {},
      {
        env: jwtEnv,
        saleEvents: fixture.events,
      },
    );
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.userId, exp.userId);
    assert.equal(json.sales.count, exp.sales.count);
    assert.equal(json.sales.amount, exp.sales.amount);
    assert.equal(json.sales.commission, exp.sales.commission);
    assert.equal(json.sales.currency, exp.sales.currency);
    assert.ok(Array.isArray(json.currencies));
    assert.equal(json.currencies.length, 2);
    assert.deepEqual(json.topMerchants, []);
  });

  it('empty sales stay zeros', async () => {
    const got = await aggregateSales({
      userId: 'FROM_JWT',
      env: 'live',
      from: '2026-10-01',
      to: '2026-10-08',
      events: [],
    });
    assert.deepEqual(got.sales, {
      count: 0,
      amount: 0,
      commission: 0,
      currency: 'GBP',
    });
    assert.deepEqual(got.currencies, []);
  });
});
