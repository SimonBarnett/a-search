'use strict';

/**
 * FR #4782: nonRetryable provider faults must land in the DLQ on the first
 * failure (SendMessage to DLQ + DeleteMessage), not wait for maxReceiveCount 3.
 * Retryable 429/5xx gateway keep throw + visibility backoff.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  handleSqsWith429,
  isImmediateDlqFault,
} = require('../shared/search/handleSqsWith429');

function baseRecord(bodyObj) {
  return {
    body: JSON.stringify(bodyObj),
    receiptHandle: 'rh-4782',
    attributes: {
      MessageGroupId: 'rakuten',
      MessageDeduplicationId: 'dedupe-orig',
      ApproximateReceiveCount: '1',
    },
    eventSourceARN: 'arn:aws:sqs:eu-west-2:123456789012:a-search-rakuten-live.fifo',
  };
}

describe('FR #4782 nonRetryable immediate DLQ', () => {
  it('classifies permanent / nonRetryable faults for immediate DLQ', () => {
    assert.equal(
      isImmediateDlqFault({ code: 'creators_not_eligible', statusCode: 403 }),
      false,
    ); // FR #5220 unavailable
    assert.equal(
      isImmediateDlqFault({
        code: 'rakuten_invalid_context',
        statusCode: 400,
        nonRetryable: true,
      }),
      true,
    );
    assert.equal(
      isImmediateDlqFault({ code: 'cj_not_authorised', statusCode: 403 }),
      true,
    );
    // Retryable gateway / 429 must NOT immediate-DLQ.
    assert.equal(isImmediateDlqFault({ statusCode: 429 }), false);
    assert.equal(isImmediateDlqFault({ statusCode: 503 }), false);
  });

  it('sends to DLQ, deletes source message, does not throw', async () => {
    const sent = [];
    const deleted = [];
    const puts = [];
    const intake = [];
    const err = Object.assign(new Error('Rakuten INVALID_CONTEXT'), {
      code: 'rakuten_invalid_context',
      statusCode: 400,
      nonRetryable: true,
    });
    const out = await handleSqsWith429({
      event: {
        Records: [
          baseRecord({
            searchId: 'srch_4782',
            searchid: 'srch_4782',
            hostkey: 'club.example',
            guid: 'guid-4782',
            env: 'sandbox',
            source: 'rakuten',
          }),
        ],
      },
      run: async () => {
        throw err;
      },
      deps: {
        putObject: async (args) => {
          puts.push(args);
          return {};
        },
      },
      sendMessage: async (input) => {
        sent.push(input);
        return { MessageId: 'mid-dlq' };
      },
      deleteMessage: async (input) => {
        deleted.push(input);
        return {};
      },
      queueUrl: 'https://sqs.example/source.fifo',
      dlqUrl: 'https://sqs.example/source-dlq.fifo',
      reportException: async (args) => {
        intake.push(args);
      },
      logError: () => {},
      source: 'rakuten',
    });
    // FR #4917: DONE/dlq may be written; never an IN/ status file.
    assert.equal(
      puts.filter((p) => /\/IN\//i.test(String(p.Key || ''))).length,
      0,
    );
    assert.equal(intake.length, 0);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].QueueUrl, 'https://sqs.example/source-dlq.fifo');
    assert.match(String(sent[0].MessageBody || ''), /srch_4782/);
    assert.equal(sent[0].MessageGroupId, 'rakuten');
    assert.ok(sent[0].MessageDeduplicationId);
    assert.equal(deleted.length, 1);
    assert.equal(deleted[0].ReceiptHandle, 'rh-4782');
    assert.equal(deleted[0].QueueUrl, 'https://sqs.example/source.fifo');
    assert.equal(out.ok, true);
    assert.equal(out.results[0].deadLettered, true);
    assert.equal(out.results[0].code, 'rakuten_invalid_context');
  });

  it('429 still throws (no immediate DLQ send)', async () => {
    const sent = [];
    const deleted = [];
    const err = Object.assign(new Error('throttled'), { statusCode: 429 });
    await assert.rejects(
      () =>
        handleSqsWith429({
          event: {
            Records: [
              baseRecord({
                searchId: 'srch_429',
                searchid: 'srch_429',
                env: 'sandbox',
              }),
            ],
          },
          run: async () => {
            throw err;
          },
          changeMessageVisibility: async () => {},
          sendMessage: async (input) => {
            sent.push(input);
          },
          deleteMessage: async (input) => {
            deleted.push(input);
          },
          queueUrl: 'https://sqs.example/source.fifo',
          dlqUrl: 'https://sqs.example/dlq.fifo',
          source: 'rakuten',
        }),
      (e) => e === err,
    );
    assert.equal(sent.length, 0);
    assert.equal(deleted.length, 0);
  });

  it('stack wires SQS_DLQ_URL + grantSendMessages on workers', () => {
    const stack = fs.readFileSync(
      path.join(__dirname, '..', 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /SQS_DLQ_URL/);
    assert.match(stack, /SQS_QUEUE_URL/);
    assert.match(stack, /grantSendMessages\(\s*worker\s*\)/);
  });
});
