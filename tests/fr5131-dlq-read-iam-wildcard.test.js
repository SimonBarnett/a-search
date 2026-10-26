'use strict';

/**
 * FR #5131: DLQ read IAM must use a-search-* wildcard (inline policy 2048 limit).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

/**
 * Rough IAM policy document size for the FR #5122/#5131 ops statements.
 * @param {string[]} getAttrsResources
 */
function estimateOpsInlinePolicyBytes(getAttrsResources) {
  const doc = {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'OpsReadProviderDlq',
        Effect: 'Allow',
        Action: ['sqs:GetQueueAttributes'],
        Resource: getAttrsResources,
      },
      {
        Sid: 'OpsListQueues',
        Effect: 'Allow',
        Action: ['sqs:ListQueues'],
        Resource: '*',
      },
    ],
  };
  return Buffer.byteLength(JSON.stringify(doc), 'utf8');
}

describe('FR #5131 DLQ read IAM wildcard (inline 2048)', () => {
  it('CDK uses a-search-* SQS wildcard, not per-queue ARN list', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(src, /#5131/);
    assert.match(
      src,
      /opsReadSqsWildcard =\s*`arn:aws:sqs:\$\{this\.region\}:\$\{this\.account\}:a-search-\*`/,
    );
    assert.doesNotMatch(src, /opsReadSqsArns/);
    assert.doesNotMatch(src, /opsReadSqsArns\.push/);
  });

  it('wildcard GetQueueAttributes statement stays under IAM user inline budget', () => {
    const wildcard = 'arn:aws:sqs:eu-west-2:123456789012:a-search-*';
    const many = [];
    for (const name of [
      'amazon',
      'ebay',
      'rakuten',
      'cj',
      'kelkoo',
      'etsy',
      'awin',
      'impact',
      'aliexpress',
      'bol',
      'flexoffers',
      'webgains',
    ]) {
      for (const env of ['live', 'sandbox']) {
        many.push(
          `arn:aws:sqs:eu-west-2:123456789012:a-search-provider-${name}-${env}.fifo`,
        );
        many.push(
          `arn:aws:sqs:eu-west-2:123456789012:a-search-provider-${name}-${env}-dlq.fifo`,
        );
      }
    }
    many.push(
      'arn:aws:sqs:eu-west-2:123456789012:a-search-db-backed',
      'arn:aws:sqs:eu-west-2:123456789012:a-search-db-backed-dlq',
    );
    const wildBytes = estimateOpsInlinePolicyBytes([wildcard]);
    const manyBytes = estimateOpsInlinePolicyBytes(many);
    assert.ok(
      wildBytes < 1900,
      `wildcard policy ${wildBytes} must stay under ~1900 of 2048`,
    );
    assert.ok(
      manyBytes > 2048,
      `enumerated policy ${manyBytes} should exceed 2048 (repro #5131)`,
    );
  });

  it('docs mention FR #5131 wildcard / 2048 inline limit', () => {
    const doc = fs.readFileSync(
      path.join(ROOT, 'docs', 'search-fanout.md'),
      'utf8',
    );
    assert.match(doc, /FR #5131/);
    assert.match(doc, /a-search-\*/);
    assert.match(doc, /2048/);
  });
});
