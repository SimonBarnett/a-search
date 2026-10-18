'use strict';

/**
 * FR #4039: convert provider live/sandbox queues to FIFO
 * a-search-provider-{name}-{env}.fifo (+ DLQ .fifo), MessageGroupId kept.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { queueName, queueDlqName } = require('../providers/queueName');

const ROOT = path.join(__dirname, '..');

describe('FR #4039 provider FIFO queue names', () => {
  it('queueName is a-search-provider-{id}-{env}.fifo', () => {
    assert.equal(queueName('ebay', 'live'), 'a-search-provider-ebay-live.fifo');
    assert.equal(
      queueName('amazon', 'sandbox'),
      'a-search-provider-amazon-sandbox.fifo',
    );
    assert.notEqual(queueName('ebay', 'live'), queueName('ebay', 'sandbox'));
  });

  it('queueDlqName ends with -dlq.fifo (never .fifo-dlq)', () => {
    assert.equal(
      queueDlqName('ebay', 'live'),
      'a-search-provider-ebay-live-dlq.fifo',
    );
    assert.ok(!queueDlqName('ebay', 'live').includes('.fifo-dlq'));
  });
});

describe('FR #4039 CDK + send pins (source)', () => {
  it('stack creates fifo provider queues with fifo:true and stagedFifoName', () => {
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk/lib/a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /FR #4039/);
    assert.match(stack, /stagedFifoName\(queueName/);
    assert.match(stack, /fifo:\s*true/);
    assert.match(stack, /contentBasedDeduplication:\s*false/);
    assert.match(stack, /queueDlqName|replace\(\/\.fifo/);
    // keep reserved concurrency 1 (both hardenings)
    assert.match(stack, /reservedConcurrentExecutions:\s*1/);
  });

  it('sqsSend sets MessageGroupId + MessageDeduplicationId for FIFO', () => {
    const send = fs.readFileSync(
      path.join(ROOT, 'entry/src/sqsSend.js'),
      'utf8',
    );
    assert.match(send, /MessageGroupId/);
    assert.match(send, /MessageDeduplicationId/);
  });

  it('docs/search-fanout.md documents FIFO provider queue names', () => {
    const doc = fs.readFileSync(
      path.join(ROOT, 'docs/search-fanout.md'),
      'utf8',
    );
    assert.match(doc, /a-search-provider-\{name\}/);
    assert.match(doc, /\.fifo/);
    assert.match(doc, /MessageGroupId/);
    assert.match(doc, /4039|FIFO/);
  });
});
