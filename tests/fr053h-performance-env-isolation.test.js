'use strict';

/** FR-053h: performance live vs sandbox isolation — sandbox does not see live rows */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  aggregateClicksVisits,
  aggregateClickVisitEvents,
} = require('../entry/src/performanceClicksVisits');
const { aggregateSales } = require('../entry/src/performanceSales');
const { aggregateTop } = require('../entry/src/performanceTop');
const { handler } = require('../entry/src/index');

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

/** Mixed live+sandbox rows for the same JWT user — isolation must not leak. */
const mixedClickVisit = [
  {
    userId: 'JWTUSER1',
    env: 'live',
    type: 'click',
    at: '2026-10-04T10:00:00.000Z',
    visitorId: 'live-v1',
  },
  {
    userId: 'JWTUSER1',
    env: 'live',
    type: 'visit',
    at: '2026-10-04T10:00:01.000Z',
    visitorId: 'live-v1',
  },
  {
    userId: 'JWTUSER1',
    env: 'live',
    type: 'click',
    at: '2026-10-05T10:00:00.000Z',
    visitorId: 'live-v2',
  },
  {
    userId: 'JWTUSER1',
    env: 'sandbox',
    type: 'click',
    at: '2026-10-04T12:00:00.000Z',
    visitorId: 'sb-v1',
  },
  {
    userId: 'JWTUSER1',
    env: 'sandbox',
    type: 'visit',
    at: '2026-10-04T12:00:01.000Z',
    visitorId: 'sb-v1',
  },
];

const mixedSales = [
  {
    userId: 'JWTUSER1',
    env: 'live',
    at: '2026-10-04T15:00:00.000Z',
    amount: 100,
    commission: 10,
    currency: 'GBP',
  },
  {
    userId: 'JWTUSER1',
    env: 'sandbox',
    at: '2026-10-04T16:00:00.000Z',
    amount: 5,
    commission: 0.5,
    currency: 'GBP',
  },
];

const mixedTop = [
  {
    userId: 'JWTUSER1',
    env: 'live',
    at: '2026-10-04T10:00:00.000Z',
    linkId: 'live-link',
    merchantId: 'live-m',
    merchantName: 'Live Merch',
    clicks: 50,
    sales: 9,
  },
  {
    userId: 'JWTUSER1',
    env: 'sandbox',
    at: '2026-10-04T11:00:00.000Z',
    linkId: 'sb-link',
    merchantId: 'sb-m',
    merchantName: 'Sandbox Merch',
    clicks: 2,
    sales: 1,
  },
];

describe('FR-053h performance live vs sandbox isolation', () => {
  it('sandbox aggregate ignores live click/visit rows', async () => {
    const got = await aggregateClicksVisits({
      userId: 'JWTUSER1',
      env: 'sandbox',
      from: '2026-10-01',
      to: '2026-10-08',
      events: mixedClickVisit,
    });
    assert.equal(got.clicks, 1);
    assert.equal(got.visits, 1);
    assert.equal(got.uniqueVisitors, 1);

    const live = aggregateClickVisitEvents(mixedClickVisit, {
      userId: 'JWTUSER1',
      env: 'live',
      from: '2026-10-01',
      to: '2026-10-08',
    });
    assert.equal(live.clicks, 2);
    assert.equal(live.visits, 1);
  });

  it('sandbox sales aggregate ignores live sale rows', async () => {
    const sb = await aggregateSales({
      userId: 'JWTUSER1',
      env: 'sandbox',
      from: '2026-10-01',
      to: '2026-10-08',
      events: mixedSales,
    });
    assert.equal(sb.sales.count, 1);
    assert.equal(sb.sales.amount, 5);
    assert.equal(sb.sales.commission, 0.5);

    const live = await aggregateSales({
      userId: 'JWTUSER1',
      env: 'live',
      from: '2026-10-01',
      to: '2026-10-08',
      events: mixedSales,
    });
    assert.equal(live.sales.count, 1);
    assert.equal(live.sales.amount, 100);
  });

  it('sandbox top aggregate ignores live link/merchant rows', async () => {
    const sb = await aggregateTop({
      userId: 'JWTUSER1',
      env: 'sandbox',
      from: '2026-10-01',
      to: '2026-10-08',
      events: mixedTop,
    });
    assert.equal(sb.topLinks.length, 1);
    assert.equal(sb.topLinks[0].linkId, 'sb-link');
    assert.equal(sb.topMerchants.length, 1);
    assert.equal(sb.topMerchants[0].merchantId, 'sb-m');

    const live = await aggregateTop({
      userId: 'JWTUSER1',
      env: 'live',
      from: '2026-10-01',
      to: '2026-10-08',
      events: mixedTop,
    });
    assert.equal(live.topLinks.length, 1);
    assert.equal(live.topLinks[0].linkId, 'live-link');
  });

  it('fixture live query still excludes sandbox noise (clicks/sales/top)', async () => {
    const cv = await aggregateClicksVisits({
      userId: clicksFix.expected.userId,
      env: 'live',
      from: clicksFix.expected.from,
      to: clicksFix.expected.to,
      events: clicksFix.events,
    });
    assert.equal(cv.clicks, clicksFix.expected.clicks);

    const sales = await aggregateSales({
      userId: salesFix.expected.userId,
      env: 'live',
      from: salesFix.expected.from,
      to: salesFix.expected.to,
      events: salesFix.events,
    });
    assert.equal(sales.sales.count, salesFix.expected.sales.count);

    const top = await aggregateTop({
      userId: topFix.expected.userId,
      env: 'live',
      from: topFix.expected.from,
      to: topFix.expected.to,
      events: topFix.events,
    });
    assert.ok(top.topLinks.every((r) => r.linkId !== 'lnk_sb'));
    assert.ok(top.topMerchants.every((r) => r.merchantId !== 'm_sb'));
  });

  it('handler sandbox=true does not see live rows (JWT + injected events)', async () => {
    const res = await handler(
      {
        httpMethod: 'POST',
        path: '/account/performance',
        rawPath: '/account/performance',
        headers: {
          authorization: `Bearer ${validToken('JWTUSER1')}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sandbox: true,
          from: '2026-10-01',
          to: '2026-10-08',
        }),
      },
      {},
      {
        env: jwtEnv,
        clickVisitEvents: mixedClickVisit,
        saleEvents: mixedSales,
        topEvents: mixedTop,
      },
    );
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.ok, true);
    assert.equal(json.userId, 'JWTUSER1');
    assert.equal(json.env, 'sandbox');
    assert.equal(json.clicks, 1);
    assert.equal(json.visits, 1);
    assert.equal(json.uniqueVisitors, 1);
    assert.equal(json.sales.count, 1);
    assert.equal(json.sales.amount, 5);
    assert.equal(json.topLinks.length, 1);
    assert.equal(json.topLinks[0].linkId, 'sb-link');
    assert.equal(json.topMerchants.length, 1);
    assert.equal(json.topMerchants[0].merchantId, 'sb-m');
  });

  it('handler live (default) does not see sandbox rows', async () => {
    const res = await handler(
      {
        httpMethod: 'GET',
        path: '/account/performance',
        rawPath: '/account/performance',
        headers: { authorization: `Bearer ${validToken('JWTUSER1')}` },
        queryStringParameters: {
          from: '2026-10-01',
          to: '2026-10-08',
        },
      },
      {},
      {
        env: jwtEnv,
        clickVisitEvents: mixedClickVisit,
        saleEvents: mixedSales,
        topEvents: mixedTop,
      },
    );
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.env, 'live');
    assert.equal(json.clicks, 2);
    assert.equal(json.visits, 1);
    assert.equal(json.sales.amount, 100);
    assert.equal(json.topLinks[0].linkId, 'live-link');
  });
});
