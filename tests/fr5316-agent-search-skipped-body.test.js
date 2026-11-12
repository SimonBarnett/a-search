'use strict';

/**
 * FR #5316: Agent POST /search 202 body includes skipped [{ id, reason }].
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { providerMarkerKey } = require('../shared/affiliates/keys');
const { handleSearch } = require('../entry/src/index');

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

describe('FR #5316 agent search 202 skipped body', () => {
  it('HTTP 202 lists affiliates_enabled_0 and missing_queue_url on skipped', async () => {
    const sent = [];
    const clubs = {
      [`club.example/`]: { userid: 'MMFC0001' },
      [`club.example/${GUID}/`]: {},
    };
    const affiliates = {
      [providerMarkerKey('ebay')]: { enabled: '0' },
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
          // rakuten queue present; ebay intentionally omitted (missing_queue_url)
          SQS_RAKUTEN_LIVE_URL: 'https://sqs.example/rakuten.fifo',
          SQS_DB_BACKED_LIVE_URL: 'https://sqs.example/db',
        },
        headObject: async ({ Key }) => {
          if (!(Key in clubs)) {
            const err = new Error('missing');
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return { Metadata: clubs[Key] };
        },
        headAffiliatesObject: async ({ Key }) => {
          if (!(Key in affiliates)) {
            const err = new Error('missing');
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return { Metadata: affiliates[Key] };
        },
        sendMessage: async (p) => {
          sent.push(p);
        },
        newSearchId: () => 'srch_5316',
        enabled: () => ['ebay', 'rakuten'],
        loadRegistry: () => ({
          sources: [
            {
              id: 'ebay',
              kind: 'live',
              awsSearch: true,
              queueEnv: 'SQS_EBAY_URL',
            },
            {
              id: 'rakuten',
              kind: 'live',
              awsSearch: true,
              queueEnv: 'SQS_RAKUTEN_URL',
            },
          ],
        }),
      },
    );
    assert.equal(res.statusCode, 202);
    const body = JSON.parse(res.body);
    assert.equal(body.searchid, 'srch_5316');
    assert.deepEqual(body.queued, ['rakuten', 'sql']);
    assert.ok(Array.isArray(body.skipped), 'skipped must be on HTTP body');
    assert.deepEqual(
      body.skipped.map((s) => s.id).sort(),
      ['ebay'],
    );
    // ebay never reaches affiliates gate (no queue URL) — wire reason missing_queue_url
    assert.equal(
      body.skipped.find((s) => s.id === 'ebay').reason,
      'missing_queue_url',
    );
    // Need both reason kinds on the body: run a second fixture below for enabled_0
    // when the queue URL is present.
    assert.equal(sent.length, 2);
  });

  it('HTTP 202 lists affiliates_enabled_0 when queue URL exists', async () => {
    const clubs = {
      [`club.example/`]: { userid: 'MMFC0001' },
      [`club.example/${GUID}/`]: {},
    };
    const affiliates = {
      [providerMarkerKey('ebay')]: { enabled: '0' },
      [providerMarkerKey('rakuten')]: { enabled: '1' },
    };
    const res = await handleSearch(
      iamEvent({
        hostkey: 'club.example',
        guid: GUID,
        queries: ['boots'],
      }),
      {
        env: {
          SQS_EBAY_LIVE_URL: 'https://sqs.example/ebay.fifo',
          SQS_RAKUTEN_LIVE_URL: 'https://sqs.example/rakuten.fifo',
          SQS_DB_BACKED_LIVE_URL: 'https://sqs.example/db',
        },
        headObject: async ({ Key }) => {
          if (!(Key in clubs)) {
            const err = new Error('missing');
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return { Metadata: clubs[Key] };
        },
        headAffiliatesObject: async ({ Key }) => {
          if (!(Key in affiliates)) {
            const err = new Error('missing');
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return { Metadata: affiliates[Key] };
        },
        sendMessage: async () => {},
        newSearchId: () => 'srch_5316b',
        enabled: () => ['ebay', 'rakuten'],
        loadRegistry: () => ({
          sources: [
            {
              id: 'ebay',
              kind: 'live',
              awsSearch: true,
              queueEnv: 'SQS_EBAY_URL',
            },
            {
              id: 'rakuten',
              kind: 'live',
              awsSearch: true,
              queueEnv: 'SQS_RAKUTEN_URL',
            },
          ],
        }),
      },
    );
    assert.equal(res.statusCode, 202);
    const body = JSON.parse(res.body);
    assert.deepEqual(body.queued, ['rakuten', 'sql']);
    assert.ok(Array.isArray(body.skipped));
    assert.equal(body.skipped.length, 1);
    assert.deepEqual(body.skipped[0], {
      id: 'ebay',
      reason: 'affiliates_enabled_0',
    });
  });

  it('combined fixture: enabled_0 + missing_queue_url both on HTTP body', async () => {
    const clubs = {
      [`club.example/`]: { userid: 'MMFC0001' },
      [`club.example/${GUID}/`]: {},
    };
    const affiliates = {
      [providerMarkerKey('amazon')]: { enabled: '0' },
      [providerMarkerKey('rakuten')]: { enabled: '1' },
      // ebay: queue missing — never Heads affiliates
    };
    const res = await handleSearch(
      iamEvent({
        hostkey: 'club.example',
        guid: GUID,
        queries: ['q'],
      }),
      {
        env: {
          SQS_AMAZON_LIVE_URL: 'https://sqs.example/amazon.fifo',
          SQS_RAKUTEN_LIVE_URL: 'https://sqs.example/rakuten.fifo',
          // SQS_EBAY_LIVE_URL omitted
          SQS_DB_BACKED_LIVE_URL: 'https://sqs.example/db',
        },
        headObject: async ({ Key }) => {
          if (!(Key in clubs)) {
            const err = new Error('missing');
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return { Metadata: clubs[Key] };
        },
        headAffiliatesObject: async ({ Key }) => {
          if (!(Key in affiliates)) {
            const err = new Error('missing');
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return { Metadata: affiliates[Key] };
        },
        sendMessage: async () => {},
        newSearchId: () => 'srch_5316c',
        enabled: () => ['amazon', 'ebay', 'rakuten'],
        loadRegistry: () => ({
          sources: [
            {
              id: 'amazon',
              kind: 'live',
              awsSearch: true,
              queueEnv: 'SQS_AMAZON_URL',
            },
            {
              id: 'ebay',
              kind: 'live',
              awsSearch: true,
              queueEnv: 'SQS_EBAY_URL',
            },
            {
              id: 'rakuten',
              kind: 'live',
              awsSearch: true,
              queueEnv: 'SQS_RAKUTEN_URL',
            },
          ],
        }),
      },
    );
    assert.equal(res.statusCode, 202);
    const body = JSON.parse(res.body);
    assert.deepEqual(body.queued, ['rakuten', 'sql']);
    const byId = Object.fromEntries(body.skipped.map((s) => [s.id, s.reason]));
    assert.equal(byId.amazon, 'affiliates_enabled_0');
    assert.equal(byId.ebay, 'missing_queue_url');
    assert.equal(Object.keys(byId).sort().join(','), 'amazon,ebay');
  });

  it('202 includes skipped: [] when nothing was skipped', async () => {
    const clubs = {
      [`club.example/`]: { userid: 'MMFC0001' },
      [`club.example/${GUID}/`]: {},
    };
    const affiliates = {
      [providerMarkerKey('rakuten')]: { enabled: '1' },
    };
    const res = await handleSearch(
      iamEvent({
        hostkey: 'club.example',
        guid: GUID,
        queries: ['q'],
      }),
      {
        env: {
          SQS_RAKUTEN_LIVE_URL: 'https://sqs.example/rakuten.fifo',
          SQS_DB_BACKED_LIVE_URL: 'https://sqs.example/db',
        },
        headObject: async ({ Key }) => {
          if (!(Key in clubs)) {
            const err = new Error('missing');
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return { Metadata: clubs[Key] };
        },
        headAffiliatesObject: async ({ Key }) => {
          if (!(Key in affiliates)) {
            const err = new Error('missing');
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return { Metadata: affiliates[Key] };
        },
        sendMessage: async () => {},
        newSearchId: () => 'srch_5316d',
        enabled: () => ['rakuten'],
        loadRegistry: () => ({
          sources: [
            {
              id: 'rakuten',
              kind: 'live',
              awsSearch: true,
              queueEnv: 'SQS_RAKUTEN_URL',
            },
          ],
        }),
      },
    );
    assert.equal(res.statusCode, 202);
    const body = JSON.parse(res.body);
    assert.deepEqual(body.queued, ['rakuten', 'sql']);
    assert.deepEqual(body.skipped, []);
  });
});
