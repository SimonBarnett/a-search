'use strict';

/**
 * MRB #4785 hostile: FR #4782 immediate DLQ — missing env fallback, amazon/cj
 * permanent faults, hard 5xx still redrive (no SendMessage).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  handleSqsWith429,
  isImmediateDlqFault,
} = require('../shared/search/handleSqsWith429');

function baseRecord(bodyObj) {
  return {
    body: JSON.stringify(bodyObj),
    receiptHandle: 'rh-mrb4785',
    attributes: { MessageGroupId: 'amazon' },
  };
}

const msg = {
  searchId: 'srch_mrb4785',
  searchid: 'srch_mrb4785',
  hostkey: 'club.example',
  guid: 'guid-mrb4785',
  env: 'sandbox',
  source: 'amazon',
};

describe('MRB #4785 hostile FR #4782', () => {
  it('hard 500 and gateway 5xx are not immediate-DLQ', () => {
    assert.equal(isImmediateDlqFault({ statusCode: 500 }), false);
    assert.equal(isImmediateDlqFault({ statusCode: 502 }), false);
    assert.equal(isImmediateDlqFault({ statusCode: 504 }), false);
  });

  it('creators_not_eligible is provider_unavailable: ack, no DLQ (FR #5220)', async () => {
    const sent = [];
    const deleted = [];
    const puts = [];
    const logs = [];
    const err = Object.assign(new Error('not eligible'), {
      code: 'creators_not_eligible',
      statusCode: 403,
      nonRetryable: true,
    });
    const out = await handleSqsWith429({
      event: { Records: [baseRecord(msg)] },
      run: async () => {
        throw err;
      },
      deps: {
        putObject: async (input) => {
          puts.push(input);
          return {};
        },
      },
      sendMessage: async (input) => {
        sent.push(input);
        return {};
      },
      deleteMessage: async (input) => {
        deleted.push(input);
        return {};
      },
      queueUrl: 'https://sqs.example/src.fifo',
      dlqUrl: 'https://sqs.example/dlq.fifo',
      logError: (...parts) => {
        logs.push(parts.join(' '));
      },
      source: 'amazon',
    });
    assert.equal(sent.length, 0);
    assert.equal(deleted.length, 0);
    assert.equal(out.results[0].skipped, 'provider_unavailable');
    assert.equal(out.results[0].code, 'creators_not_eligible');
    assert.equal((out.batchItemFailures || []).length, 0);
    assert.equal(
      puts.filter((p) => String(p.Key || '').includes('/IN/') && String(p.Key || '').includes('amazon')).length,
      0,
    );
    assert.ok(logs.some((l) => /provider_unavailable/.test(l)));
  });

  it('other amazon permanent 403 still immediate-DLQ send+delete', async () => {
    const sent = [];
    const deleted = [];
    const err = Object.assign(new Error('forbidden'), {
      code: 'amazon_access_denied',
      statusCode: 403,
      nonRetryable: true,
    });
    const out = await handleSqsWith429({
      event: { Records: [baseRecord(msg)] },
      run: async () => {
        throw err;
      },
      sendMessage: async (input) => {
        sent.push(input);
        return {};
      },
      deleteMessage: async (input) => {
        deleted.push(input);
        return {};
      },
      queueUrl: 'https://sqs.example/src.fifo',
      dlqUrl: 'https://sqs.example/dlq.fifo',
      logError: () => {},
      source: 'amazon',
    });
    assert.equal(sent.length, 1);
    assert.equal(deleted.length, 1);
    assert.equal(out.results[0].deadLettered, true);
  });

  it('missing SQS_DLQ_URL falls back to throw (redeploy-safe)', async () => {
    const sent = [];
    const err = Object.assign(new Error('bad context'), {
      code: 'rakuten_invalid_context',
      statusCode: 400,
      nonRetryable: true,
    });
    await assert.rejects(
      () =>
        handleSqsWith429({
          event: { Records: [baseRecord({ ...msg, source: 'rakuten' })] },
          run: async () => {
            throw err;
          },
          sendMessage: async (input) => {
            sent.push(input);
          },
          deleteMessage: async () => {},
          queueUrl: 'https://sqs.example/src.fifo',
          // dlqUrl omitted — resolveImmediateDlqDeps returns null
          logError: () => {},
          source: 'rakuten',
        }),
      (e) => e === err,
    );
    assert.equal(sent.length, 0);
  });

  it('hard 500 throws and never SendMessage to DLQ', async () => {
    const sent = [];
    const deleted = [];
    const err = Object.assign(new Error('boom'), { statusCode: 500 });
    await assert.rejects(
      () =>
        handleSqsWith429({
          event: { Records: [baseRecord(msg)] },
          run: async () => {
            throw err;
          },
          sendMessage: async (input) => {
            sent.push(input);
          },
          deleteMessage: async (input) => {
            deleted.push(input);
          },
          queueUrl: 'https://sqs.example/src.fifo',
          dlqUrl: 'https://sqs.example/dlq.fifo',
          logError: () => {},
          source: 'amazon',
        }),
      (e) => e === err,
    );
    assert.equal(sent.length, 0);
    assert.equal(deleted.length, 0);
  });
});
