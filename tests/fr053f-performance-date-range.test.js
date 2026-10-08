'use strict';

/** FR-053f: performance date-range filter — out-of-range excluded */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { aggregateClicksVisits } = require('../entry/src/performanceClicksVisits');
const { aggregateSales } = require('../entry/src/performanceSales');
const { aggregateTop } = require('../entry/src/performanceTop');
const { handler } = require('../entry/src/index');
const { resolvePerformanceInput } = require('../entry/src/performance');

const clicksFix = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'fixtures', 'performance-clicks-visits.json'),
    'utf8',
  ),
);
const salesFix = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'fixtures', 'performance-sales.json'),
    'utf8',
  ),
);
const topFix = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'performance-top.json'), 'utf8'),
);

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

function validToken(userId = 'JWTUSER1') {
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

describe('FR-053f performance date-range filter', () => {
  it('resolvePerformanceInput accepts from/to and rejects bad range', () => {
    const ok = resolvePerformanceInput(
      { from: '2026-10-01', to: '2026-10-08' },
      {},
    );
    assert.equal(ok.ok, true);
    assert.equal(ok.value.from, '2026-10-01');
    assert.equal(ok.value.to, '2026-10-08');

    const bad = resolvePerformanceInput(
      { from: '2026-10-08', to: '2026-10-01' },
      {},
    );
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'invalid_date_range');
  });

  it('clicks/visits exclude out-of-range fixture rows', async () => {
    const exp = clicksFix.expected;
    const got = await aggregateClicksVisits({
      userId: exp.userId,
      env: exp.env,
      from: exp.from,
      to: exp.to,
      events: clicksFix.events,
    });
    assert.equal(got.clicks, exp.clicks);
    assert.equal(got.visits, exp.visits);
    // Narrow window: only Oct 5 click/visit for JWTUSER1 live
    const narrow = await aggregateClicksVisits({
      userId: 'JWTUSER1',
      env: 'live',
      from: '2026-10-05',
      to: '2026-10-05',
      events: clicksFix.events,
    });
    assert.equal(narrow.clicks, 1);
    assert.equal(narrow.visits, 1);
  });

  it('sales exclude out-of-range fixture rows', async () => {
    const exp = salesFix.expected;
    const got = await aggregateSales({
      userId: exp.userId,
      env: exp.env,
      from: exp.from,
      to: exp.to,
      events: salesFix.events,
    });
    assert.equal(got.sales.count, exp.sales.count);
    const narrow = await aggregateSales({
      userId: 'JWTUSER1',
      env: 'live',
      from: '2026-10-05',
      to: '2026-10-05',
      events: salesFix.events,
    });
    assert.equal(narrow.sales.count, 1);
    assert.equal(narrow.sales.amount, 80);
  });

  it('top links/merchants exclude out-of-range at', async () => {
    const exp = topFix.expected;
    const got = await aggregateTop({
      userId: exp.userId,
      env: exp.env,
      from: exp.from,
      to: exp.to,
      limit: exp.limit,
      events: topFix.events,
    });
    assert.deepEqual(got.topLinks, exp.topLinks);
    assert.ok(got.topLinks.every((x) => x.linkId !== 'lnk_old'));
    assert.ok(got.topLinks.every((x) => x.linkId !== 'lnk_future'));
  });

  it('handler 400 on invalid date range; 200 excludes out-of-range tops', async () => {
    const bad = await handler(
      {
        httpMethod: 'GET',
        path: '/account/performance',
        rawPath: '/account/performance',
        headers: { authorization: `Bearer ${validToken()}` },
        queryStringParameters: { from: 'not-a-day', to: '2026-10-08' },
      },
      {},
      { env: jwtEnv },
    );
    assert.equal(bad.statusCode, 400);
    assert.equal(JSON.parse(bad.body).error, 'invalid_date_range');

    const ok = await handler(
      {
        httpMethod: 'GET',
        path: '/account/performance',
        rawPath: '/account/performance',
        headers: { authorization: `Bearer ${validToken()}` },
        queryStringParameters: { from: '2026-10-01', to: '2026-10-08' },
      },
      {},
      {
        env: jwtEnv,
        topEvents: topFix.events,
        topLimit: 5,
      },
    );
    assert.equal(ok.statusCode, 200);
    const json = JSON.parse(ok.body);
    assert.equal(json.from, '2026-10-01');
    assert.equal(json.to, '2026-10-08');
    assert.ok(json.topLinks.every((x) => x.linkId !== 'lnk_old'));
    assert.ok(json.topMerchants.every((x) => x.merchantId !== 'm_old'));
  });
});
