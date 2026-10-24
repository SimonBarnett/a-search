'use strict';

/**
 * FR #4847: POST /search fan-out to provider FIFO queues must send
 * MessageGroupId even when the payload omitted messageGroupId
 * (fanOutEnqueue / buildPayload does not set it).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createSqsSendMessage } = require('../entry/src/sqsSend');
const { fanOutEnqueue } = require('../entry/src/enqueue');

describe('FR #4847 FIFO MessageGroupId on POST /search fan-out', () => {
  it('sets MessageGroupId from source when payload has none and QueueUrl is .fifo', async () => {
    const sent = [];
    class FakeSendMessageCommand {
      constructor(input) {
        this.input = input;
      }
    }
    const sendMessage = createSqsSendMessage({
      envVars: {
        SQS_EBAY_LIVE_URL:
          'https://sqs.example/123/a-search-provider-ebay-live.fifo',
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
          { id: 'ebay', kind: 'live', awsSearch: true, queueEnv: 'SQS_EBAY_URL' },
        ],
      }),
    });

    await sendMessage({
      source: 'ebay',
      env: 'live',
      searchId: 'srch_4847',
    });

    assert.equal(sent.length, 1);
    assert.equal(sent[0].MessageGroupId, 'ebay');
    assert.ok(sent[0].MessageDeduplicationId);
  });

  it('fanOutEnqueue default SQS path attaches FIFO attrs for provider queues', async () => {
    const sent = [];
    class FakeSendMessageCommand {
      constructor(input) {
        this.input = input;
      }
    }
    const sendMessage = createSqsSendMessage({
      envVars: {
        SQS_EBAY_LIVE_URL:
          'https://sqs.example/123/a-search-provider-ebay-live.fifo',
        SQS_AMAZON_LIVE_URL:
          'https://sqs.example/123/a-search-provider-amazon-live.fifo',
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
          { id: 'ebay', kind: 'live', awsSearch: true, queueEnv: 'SQS_EBAY_URL' },
          { id: 'amazon', kind: 'live', awsSearch: true, queueEnv: 'SQS_AMAZON_URL' },
        ],
      }),
    });

    await fanOutEnqueue({
      searchId: 'srch_4847b',
      userId: 'U4847',
      env: 'live',
      body: { q: 'pads', catalogId: 1, category: 'c', subcategory: 's' },
      sendMessage,
      enabled: () => ['ebay', 'amazon'],
    });

    assert.equal(sent.length, 2);
    const groups = sent.map((s) => s.MessageGroupId).sort();
    assert.deepEqual(groups, ['amazon', 'ebay']);
    for (const input of sent) {
      assert.match(input.QueueUrl, /\.fifo$/);
      assert.ok(input.MessageDeduplicationId);
    }
  });

  it('still omits FIFO attrs on standard a-search-db-backed (FR #4411)', async () => {
    const sent = [];
    class FakeSendMessageCommand {
      constructor(input) {
        this.input = input;
      }
    }
    const sendMessage = createSqsSendMessage({
      envVars: {
        SQS_DB_BACKED_LIVE_URL: 'https://sqs.example/123/a-search-db-backed',
      },
      sqsClient: {
        send: async (cmd) => {
          sent.push(cmd.input);
          return {};
        },
      },
      SendMessageCommand: FakeSendMessageCommand,
    });

    await sendMessage({ source: 'sql', env: 'live', searchId: 'srch_sql' });
    assert.equal(sent[0].MessageGroupId, undefined);
    assert.equal(sent[0].MessageDeduplicationId, undefined);
  });
});
