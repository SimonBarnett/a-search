'use strict';

/**
 * FR-160: /account/performance default read path uses S3 mapping store +
 * documented stats keys when S3_RESULTS_BUCKET is set (closes injectable-only stub).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { handler } = require('../entry/src/index');
const {
  performanceStatsObjectKey,
  createPerformanceS3Deps,
} = require('../entry/src/performanceS3Read');
const {
  createMemoryS3Objects,
  createS3MappingStore,
} = require('../shared/mapping/s3Store');
const { upsertMapping } = require('../shared/mapping/mapping');

const FIXTURE_HS256_KEY = Buffer.alloc(32, 0x42).toString('hex');
const ISSUER = 'https://login.test.invalid/';
const AUDIENCE = 'a-search';
const BUCKET = 'a-search-fr160-results';
const USER = 'JWTUSER1';

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

function validToken(userId = USER) {
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
  S3_RESULTS_BUCKET: BUCKET,
};

describe('FR-160 performance S3 mapping + stats read path', () => {
  it('performanceStatsObjectKey is {env}/_stats/{userId}/events.json', () => {
    assert.equal(
      performanceStatsObjectKey({ env: 'live', userId: USER }),
      `live/_stats/${USER}/events.json`,
    );
    assert.equal(
      performanceStatsObjectKey({ env: 'sandbox', userId: 'U2' }),
      'sandbox/_stats/U2/events.json',
    );
  });

  it('handler fills clicks/visits/sales/top from S3 stats + mapping store (no injectable lists)', async () => {
    const backend = createMemoryS3Objects();
    const store = createS3MappingStore({
      bucket: BUCKET,
      putObject: backend.putObject,
      getObject: backend.getObject,
      listObjectsV2: backend.listObjectsV2,
    });
    await upsertMapping(
      {
        env: 'live',
        userId: USER,
        source: 'amazon',
        tokenOrClickRef: 'clk_fr160',
        s3Key: `live/amazon/${USER}/1/srch_fr160.json`,
        createdAt: '2026-10-03T12:00:00.000Z',
      },
      { store },
    );

    const statsKey = performanceStatsObjectKey({ env: 'live', userId: USER });
    const statsDoc = {
      clickVisitEvents: [
        {
          userId: USER,
          env: 'live',
          type: 'click',
          at: '2026-10-02T10:00:00.000Z',
          visitorId: 'v1',
        },
        {
          userId: USER,
          env: 'live',
          type: 'visit',
          at: '2026-10-02T10:00:01.000Z',
          visitorId: 'v1',
        },
        {
          userId: USER,
          env: 'live',
          type: 'click',
          at: '2026-10-04T11:00:00.000Z',
          visitorId: 'v2',
        },
      ],
      saleEvents: [
        {
          userId: USER,
          env: 'live',
          at: '2026-10-03T12:00:00.000Z',
          amount: 40,
          commission: 4,
          currency: 'GBP',
        },
      ],
      topEvents: [
        {
          userId: USER,
          env: 'live',
          at: '2026-10-03T12:00:00.000Z',
          linkId: 'lnk_fr160',
          merchantId: 'm_fr160',
          merchantName: 'FR160 Shop',
          clicks: 2,
          sales: 1,
        },
      ],
    };
    await backend.putObject({
      Bucket: BUCKET,
      Key: statsKey,
      Body: JSON.stringify(statsDoc),
      ContentType: 'application/json',
    });

    const res = await handler(
      {
        httpMethod: 'GET',
        path: '/account/performance',
        rawPath: '/account/performance',
        headers: { authorization: `Bearer ${validToken()}` },
        queryStringParameters: {
          from: '2026-10-01',
          to: '2026-10-08',
        },
      },
      {},
      {
        env: jwtEnv,
        getObject: backend.getObject,
        listObjectsV2: backend.listObjectsV2,
        putObject: backend.putObject,
        mappingStore: store,
      },
    );

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, true);
    assert.equal(body.userId, USER);
    assert.equal(body.env, 'live');
    assert.equal(body.clicks, 2);
    assert.equal(body.visits, 1);
    assert.equal(body.uniqueVisitors, 2);
    assert.equal(body.sales.count, 1);
    assert.equal(body.sales.amount, 40);
    assert.equal(body.sales.commission, 4);
    assert.ok(Array.isArray(body.topLinks));
    assert.ok(body.topLinks.some((r) => r.linkId === 'lnk_fr160'));
    assert.ok(
      body.topMerchants.some((r) => r.merchantId === 'm_fr160'),
    );
  });

  it('createPerformanceS3Deps returns null without S3_RESULTS_BUCKET', () => {
    assert.equal(
      createPerformanceS3Deps({ envVars: { ...jwtEnv, S3_RESULTS_BUCKET: '' } }),
      null,
    );
  });

  it('missing stats key yields zeros (empty account) not 500', async () => {
    const backend = createMemoryS3Objects();
    const res = await handler(
      {
        httpMethod: 'GET',
        path: '/account/performance',
        rawPath: '/account/performance',
        headers: { authorization: `Bearer ${validToken()}` },
        queryStringParameters: {
          from: '2026-10-01',
          to: '2026-10-08',
        },
      },
      {},
      {
        env: jwtEnv,
        getObject: backend.getObject,
        listObjectsV2: backend.listObjectsV2,
        putObject: backend.putObject,
      },
    );
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.clicks, 0);
    assert.equal(body.visits, 0);
    assert.equal(body.sales.count, 0);
    assert.deepEqual(body.topLinks, []);
  });

  it('FR-160 Decision LOCKED + docs + release-gap Yes', () => {
    const root = path.join(__dirname, '..');
    const fr = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-160.md'), 'utf8');
    assert.match(fr, /Decision\s*\(?\s*LOCKED\)?/i);
    assert.match(fr, /fr160-performance-s3-mapping\.test\.js/);
    assert.ok(
      !/[^\x09\x0A\x0D\x20-\x7E]/.test(fr),
      'FR-160.md must be ASCII',
    );

    const docs = fs.readFileSync(
      path.join(root, 'docs', 'endpoint-performance.md'),
      'utf8',
    );
    assert.match(docs, /FR-160/);
    assert.match(docs, /S3_RESULTS_BUCKET/);
    assert.match(docs, /_stats\/\{userId\}\/events\.json|_stats\/\{userId\}\/events\.json/);
    assert.match(docs, /_mapping/);
    assert.ok(
      !/[^\x09\x0A\x0D\x20-\x7E]/.test(docs),
      'endpoint-performance.md must be ASCII',
    );

    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-pass2-2026-10-09.md'),
      'utf8',
    );
    assert.match(
      gap,
      /Performance still injectable stub[^\n]*FR-160[^\n]*\*\*Yes\*\*/i,
    );
  });
});
