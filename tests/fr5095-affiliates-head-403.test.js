'use strict';

/**
 * FR #5095: missing a-affiliates marker (404 or HeadObject 403 without
 * ListBucket) must skip that provider, never 500 /search.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { providerMarkerKey } = require('../shared/affiliates/keys');
const { handleSearch, handler } = require('../entry/src/index');

const ROOT = path.join(__dirname, '..');
const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function iamEvent(body) {
  return {
    requestContext: {
      http: { method: 'POST', path: '/search' },
      authorizer: {
        iam: {
          userArn: 'arn:aws:iam::123456789012:user/a-search-redqueen-annotator',
        },
      },
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

describe('FR #5095 affiliates HeadObject 403 / missing', () => {
  it('one missing + one enabled=1 returns 202 and queues only enabled + sql', async () => {
    const sent = [];
    const meta = {
      [`club.example/`]: { userid: 'MMFC0001' },
      [`club.example/${GUID}/`]: {},
    };
    const aff = {
      [providerMarkerKey('rakuten')]: { enabled: '1' },
    };
    const res = await handleSearch(
      iamEvent({
        hostkey: 'club.example',
        guid: GUID,
        queries: ['servo'],
      }),
      {
        env: {
          SQS_RAKUTEN_LIVE_URL: 'https://sqs.example/rakuten.fifo',
          SQS_EBAY_LIVE_URL: 'https://sqs.example/ebay.fifo',
          SQS_DB_BACKED_LIVE_URL: 'https://sqs.example/db',
        },
        headObject: async ({ Key }) => {
          if (!(Key in meta)) {
            const err = new Error('missing');
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return { Metadata: meta[Key] };
        },
        headAffiliatesObject: async ({ Key }) => {
          if (!(Key in aff)) {
            const err = new Error('missing');
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return { Metadata: aff[Key] };
        },
        sendMessage: async (p) => {
          sent.push(p);
        },
        newSearchId: () => 'srch_5095',
        enabled: () => ['rakuten', 'ebay'],
        loadRegistry: () => ({
          sources: [
            {
              id: 'rakuten',
              kind: 'live',
              awsSearch: true,
              queueEnv: 'SQS_RAKUTEN_URL',
            },
            {
              id: 'ebay',
              kind: 'live',
              awsSearch: true,
              queueEnv: 'SQS_EBAY_URL',
            },
          ],
        }),
      },
    );
    assert.equal(res.statusCode, 202);
    const body = JSON.parse(res.body);
    assert.equal(body.searchid, 'srch_5095');
    assert.deepEqual(body.queued, ['rakuten', 'sql']);
    assert.equal(sent.length, 2);
  });

  it('HeadObject 403 on a missing-style marker skips and still 202', async () => {
    const meta = {
      [`club.example/`]: { userid: 'MMFC0001' },
      [`club.example/${GUID}/`]: {},
    };
    const res = await handleSearch(
      iamEvent({
        hostkey: 'club.example',
        guid: GUID,
        queries: ['q'],
      }),
      {
        env: { SQS_DB_BACKED_LIVE_URL: 'https://sqs.example/db' },
        headObject: async ({ Key }) => {
          if (!(Key in meta)) {
            const err = new Error('missing');
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return { Metadata: meta[Key] };
        },
        headAffiliatesObject: async () => {
          const err = new Error('Access Denied');
          err.name = 'AccessDenied';
          err.$metadata = { httpStatusCode: 403 };
          throw err;
        },
        sendMessage: async () => {},
        newSearchId: () => 'srch_5095b',
        enabled: () => ['ebay'],
        loadRegistry: () => ({
          sources: [
            {
              id: 'ebay',
              kind: 'live',
              awsSearch: true,
              queueEnv: 'SQS_EBAY_URL',
            },
          ],
        }),
      },
    );
    assert.equal(res.statusCode, 202);
    const body = JSON.parse(res.body);
    assert.deepEqual(body.queued, ['sql']);
  });

  it('CDK grants ListBucket on the a-affiliates bucket', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(src, /s3:ListBucket/);
    assert.match(src, /arn:aws:s3:::a-affiliates'/);
    assert.match(src, /FR #5095/);
  });

  it('handler 500 logs error name before internal_error', async () => {
    const logs = [];
    const err = new Error('sqs_boom');
    err.name = 'SqsBoom';
    const res = await handler(
      iamEvent({
        hostkey: 'club.example',
        guid: GUID,
        queries: ['q'],
      }),
      {},
      {
        log: { error: (...a) => logs.push(a.join(' ')) },
        reportException: async () => {},
        env: { SQS_DB_BACKED_LIVE_URL: 'https://sqs.example/db' },
        headObject: async ({ Key }) => {
          if (String(Key).endsWith('/')) {
            return { Metadata: { userid: 'MMFC0001' } };
          }
          return { Metadata: {} };
        },
        headAffiliatesObject: async () => {
          const miss = new Error('missing');
          miss.name = 'NotFound';
          miss.$metadata = { httpStatusCode: 404 };
          throw miss;
        },
        sendMessage: async () => {
          throw err;
        },
        newSearchId: () => 'srch_5095c',
        enabled: () => [],
        loadRegistry: () => ({ sources: [] }),
      },
    );
    assert.equal(res.statusCode, 500);
    const body = JSON.parse(res.body);
    assert.equal(body.error, 'internal_error');
    assert.ok(logs.some((l) => /SqsBoom/.test(l)));
    assert.ok(!logs.some((l) => /secret|FAKEACCESS/i.test(l)));
  });
});
