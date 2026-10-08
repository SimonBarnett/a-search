'use strict';

/** FR-053c: performance clicks/visits aggregate — counts match fixture */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  aggregateClicksVisits,
  aggregateClickVisitEvents,
} = require('../entry/src/performanceClicksVisits');
const { handler } = require('../entry/src/index');

const fixturePath = path.join(
  __dirname,
  'fixtures',
  'performance-clicks-visits.json',
);
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

describe('FR-053c performance clicks/visits aggregate', () => {
  it('aggregate counts match fixture expected', async () => {
    const exp = fixture.expected;
    const got = await aggregateClicksVisits({
      userId: exp.userId,
      env: exp.env,
      from: exp.from,
      to: exp.to,
      events: fixture.events,
    });
    assert.equal(got.clicks, exp.clicks);
    assert.equal(got.visits, exp.visits);
    assert.equal(got.uniqueVisitors, exp.uniqueVisitors);
  });

  it('excludes other userId / env / out-of-range days', () => {
    const got = aggregateClickVisitEvents(fixture.events, {
      userId: 'FROM_JWT',
      env: 'live',
      from: '2026-10-01',
      to: '2026-10-08',
    });
    // Fixture has OTHER_USER, sandbox, Sep 30, Oct 9 noise — already in expected.
    assert.equal(got.clicks, 3);
    assert.equal(got.visits, 3);
  });

  it('handler 200 fills clicks/visits from injected events; sales stay 0', async () => {
    const exp = fixture.expected;
    const res = await handler(
      {
        httpMethod: 'GET',
        path: '/account/performance',
        rawPath: '/account/performance',
        headers: { authorization: `Bearer ${validToken(exp.userId)}` },
        queryStringParameters: {
          from: exp.from,
          to: exp.to,
        },
      },
      {},
      {
        env: jwtEnv,
        clickVisitEvents: fixture.events,
      },
    );
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.userId, exp.userId);
    assert.equal(json.clicks, exp.clicks);
    assert.equal(json.visits, exp.visits);
    assert.equal(json.uniqueVisitors, exp.uniqueVisitors);
    assert.equal(json.sales.count, 0);
    assert.equal(json.sales.amount, 0);
  });

  it('empty read model stays zeros', async () => {
    const got = await aggregateClicksVisits({
      userId: 'FROM_JWT',
      env: 'live',
      from: '2026-10-01',
      to: '2026-10-08',
      events: [],
    });
    assert.deepEqual(got, { clicks: 0, visits: 0, uniqueVisitors: 0 });
  });
});
