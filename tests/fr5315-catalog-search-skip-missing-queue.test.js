'use strict';

/**
 * FR #5315: catalog POST /search returns 200 when one enabled awsSearch id
 * has no queue URL — that id is skipped; others still enqueue.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { handleSearch } = require('../entry/src/index');
const { fanOutEnqueue } = require('../entry/src/enqueue');
const { createSqsSendMessage } = require('../entry/src/sqsSend');
const { QueueUrlError } = require('../providers/resolveQueueUrl');

const FAKE_JWT_USER = 'U5315';

function authOk() {
  return { userId: FAKE_JWT_USER };
}

describe('FR #5315 catalog search skips missing_queue_url', () => {
  it('fanOutEnqueue continues when one source throws missing_queue_url', async () => {
    const sent = [];
    const result = await fanOutEnqueue({
      searchId: 'srch_5315',
      userId: FAKE_JWT_USER,
      env: 'live',
      body: {
        q: 'boots',
        catalogId: 1,
        category: 'c',
        subcategory: 's',
      },
      enabled: () => ['amazon', 'kelkoo'],
      sendMessage: async (payload) => {
        if (payload.source === 'kelkoo') {
          throw new QueueUrlError('missing_queue_url', 'missing SQS_KELKOO_LIVE_URL');
        }
        sent.push(payload.source);
      },
    });
    assert.ok(result && typeof result === 'object');
    assert.deepEqual(result.enqueued, ['amazon']);
    assert.deepEqual(result.skipped, [
      { id: 'kelkoo', reason: 'missing_queue_url' },
    ]);
    assert.deepEqual(sent, ['amazon']);
  });

  it('handleSearch 200: amazon enqueued, kelkoo skipped when queue URL missing', async () => {
    const sent = [];
    class FakeSendMessageCommand {
      constructor(input) {
        this.input = input;
      }
    }
    const sendMessage = createSqsSendMessage({
      envVars: {
        SQS_AMAZON_LIVE_URL: 'https://sqs.example.test/amazon-live',
        SQS_DB_BACKED_URL: 'https://sqs.example.test/db-backed',
        // Kelkoo intentionally absent
      },
      sqsClient: {
        send: async (cmd) => {
          sent.push(cmd.input);
          return {};
        },
      },
      SendMessageCommand: FakeSendMessageCommand,
      loadRegistry: () => ({
        sources: [
          {
            id: 'amazon',
            kind: 'live',
            awsSearch: true,
            queueEnv: 'SQS_AMAZON_URL',
          },
          {
            id: 'kelkoo',
            kind: 'live',
            awsSearch: true,
            queueEnv: 'SQS_KELKOO_URL',
          },
          {
            id: 'sql',
            kind: 'local',
            queueEnv: 'SQS_DB_BACKED_URL',
          },
        ],
      }),
    });

    const res = await handleSearch(
      {
        httpMethod: 'POST',
        path: '/search',
        headers: { Authorization: 'Bearer FAKE.jwt' },
        body: JSON.stringify({
          q: 'boots',
          catalogId: 1,
          category: 'Footwear',
          subcategory: 'Boots',
        }),
      },
      {
        verifyAuthorization: authOk,
        sendMessage,
        enabled: () => ['amazon', 'kelkoo', 'sql'],
        newSearchId: () => 'srch_5315_http',
        enqueue: (args) =>
          fanOutEnqueue({
            ...args,
            sendMessage,
            enabled: () => ['amazon', 'kelkoo', 'sql'],
          }),
      },
    );

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.accepted, true);
    assert.ok(json.enqueued.includes('amazon'));
    assert.ok(json.enqueued.includes('sql'));
    assert.ok(!json.enqueued.includes('kelkoo'));
    assert.ok(Array.isArray(json.skipped));
    assert.deepEqual(
      json.skipped.filter((s) => s.id === 'kelkoo'),
      [{ id: 'kelkoo', reason: 'missing_queue_url' }],
    );
    const sourcesSent = sent.map((input) => JSON.parse(input.MessageBody).source);
    assert.ok(sourcesSent.includes('amazon'));
    assert.ok(sourcesSent.includes('sql'));
    assert.ok(!sourcesSent.includes('kelkoo'));
  });

  it('handleSearch 200: skipped empty/absent for kelkoo when every URL present', async () => {
    const sent = [];
    class FakeSendMessageCommand {
      constructor(input) {
        this.input = input;
      }
    }
    const sendMessage = createSqsSendMessage({
      envVars: {
        SQS_AMAZON_LIVE_URL: 'https://sqs.example.test/amazon-live',
        SQS_KELKOO_LIVE_URL: 'https://sqs.example.test/kelkoo-live',
        SQS_DB_BACKED_URL: 'https://sqs.example.test/db-backed',
      },
      sqsClient: {
        send: async (cmd) => {
          sent.push(cmd.input);
          return {};
        },
      },
      SendMessageCommand: FakeSendMessageCommand,
      loadRegistry: () => ({
        sources: [
          { id: 'amazon', kind: 'live', awsSearch: true, queueEnv: 'SQS_AMAZON_URL' },
          { id: 'kelkoo', kind: 'live', awsSearch: true, queueEnv: 'SQS_KELKOO_URL' },
          { id: 'sql', kind: 'local', queueEnv: 'SQS_DB_BACKED_URL' },
        ],
      }),
    });

    const res = await handleSearch(
      {
        httpMethod: 'POST',
        path: '/search',
        headers: { Authorization: 'Bearer FAKE.jwt' },
        body: JSON.stringify({
          q: 'boots',
          catalogId: 1,
          category: 'Footwear',
          subcategory: 'Boots',
        }),
      },
      {
        verifyAuthorization: authOk,
        newSearchId: () => 'srch_5315_ok',
        enqueue: (args) =>
          fanOutEnqueue({
            ...args,
            sendMessage,
            enabled: () => ['amazon', 'kelkoo', 'sql'],
          }),
      },
    );

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.accepted, true);
    assert.deepEqual([...json.enqueued].sort(), ['amazon', 'kelkoo', 'sql'].sort());
    const skipped = Array.isArray(json.skipped) ? json.skipped : [];
    assert.ok(!skipped.some((s) => s && s.id === 'kelkoo'));
    assert.equal(sent.length, 3);
  });
});
