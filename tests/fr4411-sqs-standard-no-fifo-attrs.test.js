'use strict';

/**
 * FR #4411: entry/POST /search must not send MessageGroupId /
 * MessageDeduplicationId to standard SQS queues (a-search-db-backed for sql).
 * Those params are FIFO-only; AWS returns InvalidParameterValue on standard.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createSqsSendMessage,
  isFifoQueueUrl,
} = require('../entry/src/sqsSend');

const ROOT = path.join(__dirname, '..');

describe('FR #4411 isFifoQueueUrl', () => {
  it('detects .fifo queue names and rejects standard db-backed URLs', () => {
    assert.equal(
      isFifoQueueUrl(
        'https://sqs.eu-west-2.amazonaws.com/123/a-search-provider-ebay-live.fifo',
      ),
      true,
    );
    assert.equal(
      isFifoQueueUrl(
        'https://sqs.eu-west-2.amazonaws.com/123/a-search-db-backed',
      ),
      false,
    );
    assert.equal(
      isFifoQueueUrl(
        'https://sqs.eu-west-2.amazonaws.com/123/a-search-db-backed?x=1',
      ),
      false,
    );
    assert.equal(isFifoQueueUrl(''), false);
    assert.equal(isFifoQueueUrl(null), false);
  });
});

describe('FR #4411 createSqsSendMessage FIFO attrs gate', () => {
  function fakeSend(envVars) {
    const sent = [];
    class FakeSendMessageCommand {
      constructor(input) {
        this.input = input;
      }
    }
    const sendMessage = createSqsSendMessage({
      envVars,
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
    return { sent, sendMessage };
  }

  it('omits FIFO attrs for sql on standard a-search-db-backed URL', async () => {
    const { sent, sendMessage } = fakeSend({
      SQS_DB_BACKED_LIVE_URL:
        'https://sqs.example/123/a-search-db-backed',
      SQS_DB_BACKED_URL: 'https://sqs.example/123/a-search-db-backed',
    });
    await sendMessage({
      source: 'sql',
      env: 'live',
      searchId: 'srch_9f32847b4e02fb52e397',
      searchid: 'srch_9f32847b4e02fb52e397',
      messageGroupId: 'sql',
      messageDeduplicationId: 'srch_9f32847b4e02fb52e397-sql',
    });
    assert.equal(sent.length, 1);
    assert.match(sent[0].QueueUrl, /a-search-db-backed/);
    assert.equal(sent[0].MessageGroupId, undefined);
    assert.equal(sent[0].MessageDeduplicationId, undefined);
    assert.ok(sent[0].MessageBody);
  });

  it('keeps FIFO attrs for provider .fifo queue URLs', async () => {
    const { sent, sendMessage } = fakeSend({
      SQS_EBAY_LIVE_URL:
        'https://sqs.example/123/a-search-provider-ebay-live.fifo',
    });
    await sendMessage({
      source: 'ebay',
      env: 'live',
      searchId: 'srch_abc',
      messageGroupId: 'ebay',
      messageDeduplicationId: 'srch_abc-ebay',
    });
    assert.equal(sent.length, 1);
    assert.match(sent[0].QueueUrl, /\.fifo$/);
    assert.equal(sent[0].MessageGroupId, 'ebay');
    assert.equal(sent[0].MessageDeduplicationId, 'srch_abc-ebay');
  });
});

describe('FR #4411 source pins', () => {
  it('sqsSend gates FIFO attrs on isFifoQueueUrl (not "harmless on standard")', () => {
    const text = fs.readFileSync(
      path.join(ROOT, 'entry', 'src', 'sqsSend.js'),
      'utf8',
    );
    assert.match(text, /isFifoQueueUrl/);
    assert.match(text, /4411/);
    assert.doesNotMatch(text, /Harmless on standard queues/);
  });
});
