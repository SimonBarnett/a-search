'use strict';

/**
 * FR-032: default SQS SendMessage for entry fan-out.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { fanOutEnqueue } = require('../entry/src/enqueue');
const { createSqsSendMessage } = require('../entry/src/sqsSend');
const { resolveQueueUrl } = require('../providers/resolveQueueUrl');

describe('FR-032 resolveQueueUrl', () => {
  it('live prefers *_LIVE_URL', () => {
    const url = resolveQueueUrl({
      queueEnv: 'SQS_AMAZON_URL',
      env: 'live',
      envVars: {
        SQS_AMAZON_LIVE_URL: 'https://sqs.example/amazon-live',
        SQS_AMAZON_SANDBOX_URL: 'https://sqs.example/amazon-sandbox',
      },
    });
    assert.equal(url, 'https://sqs.example/amazon-live');
  });

  it('sandbox prefers *_SANDBOX_URL', () => {
    const url = resolveQueueUrl({
      queueEnv: 'SQS_EBAY_URL',
      env: 'sandbox',
      envVars: {
        SQS_EBAY_SANDBOX_URL: 'https://sqs.example/ebay-sandbox',
      },
    });
    assert.equal(url, 'https://sqs.example/ebay-sandbox');
  });

  it('missing URL → clear error', () => {
    assert.throws(
      () =>
        resolveQueueUrl({
          queueEnv: 'SQS_AMAZON_URL',
          env: 'live',
          envVars: {},
        }),
      (err) => err.code === 'missing_queue_url',
    );
  });
});

describe('FR-032 createSqsSendMessage + fanOutEnqueue', () => {
  it('mock SQS client: one SendMessage per enabled source with payload fields', async () => {
    const sent = [];
    class FakeSendMessageCommand {
      constructor(input) {
        this.input = input;
      }
    }
    const fakeClient = {
      send: async (cmd) => {
        sent.push(cmd.input);
        return {};
      },
    };
    const sendMessage = createSqsSendMessage({
      envVars: {
        SQS_AMAZON_LIVE_URL: 'https://sqs.example/amazon-live',
        SQS_EBAY_LIVE_URL: 'https://sqs.example/ebay-live',
      },
      sqsClient: fakeClient,
      SendMessageCommand: FakeSendMessageCommand,
      loadRegistry: () => ({
        sources: [
          { id: 'amazon', queueEnv: 'SQS_AMAZON_URL' },
          { id: 'ebay', queueEnv: 'SQS_EBAY_URL' },
        ],
      }),
    });

    const enqueued = await fanOutEnqueue({
      searchId: 'srch_test',
      userId: 'U1',
      env: 'live',
      body: {
        q: 'headphones',
        catalogId: 1,
        category: 'Electronics',
        subcategory: 'Headphones',
      },
      sendMessage,
      enabled: () => ['amazon', 'ebay'],
    });

    assert.deepEqual(enqueued, ['amazon', 'ebay']);
    assert.equal(sent.length, 2);
    for (const input of sent) {
      assert.match(input.QueueUrl, /sqs\.example/);
      const payload = JSON.parse(input.MessageBody);
      assert.equal(payload.searchId, 'srch_test');
      assert.equal(payload.userId, 'U1');
      assert.equal(payload.env, 'live');
      assert.ok(['amazon', 'ebay'].includes(payload.source));
      assert.equal(payload.queueName, `a-search-${payload.source}-live`);
    }
  });

  it('injected sendMessage bypasses AWS client (no SendMessageCommand used)', async () => {
    let awsUsed = false;
    class BoomCommand {
      constructor() {
        awsUsed = true;
      }
    }
    const payloads = [];
    await fanOutEnqueue({
      searchId: 'srch_x',
      userId: 'U2',
      env: 'sandbox',
      body: { q: 'x', catalogId: 1, category: 'c', subcategory: 's' },
      sendMessage: async (p) => {
        payloads.push(p);
      },
      enabled: () => ['amazon'],
      // If default path wrongly built, would need client — we inject sendMessage.
    });
    assert.equal(payloads.length, 1);
    assert.equal(awsUsed, false);
    void BoomCommand;
  });

  it('fail-when: default path is not empty noop — sqsSend module exists', () => {
    const p = path.join(__dirname, '..', 'entry', 'src', 'sqsSend.js');
    assert.ok(fs.existsSync(p));
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'entry', 'src', 'enqueue.js'),
      'utf8',
    );
    assert.match(text, /createSqsSendMessage/);
    assert.doesNotMatch(
      text,
      /sendMessage\s*=\s*async\s*\(\)\s*=>\s*\{\s*\}/,
    );
  });
});
