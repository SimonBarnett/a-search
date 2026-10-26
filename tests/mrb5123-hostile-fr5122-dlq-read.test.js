'use strict';

/**
 * MRB #5123 / FR #5122: hostile pins --- ops read-only DLQ IAM, no mutate.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

describe('MRB #5123 hostile FR #5122 DLQ read IAM', () => {
  it('OpsReadProviderDlq window is GetQueueAttributes only on collected ARNs', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    const i = src.indexOf('FR #5122: overnight verification needs DLQ depth');
    assert.ok(i >= 0, 'FR #5122 comment missing');
    const window = src.slice(i, i + 900);
    assert.match(window, /sid: 'OpsReadProviderDlq'/);
    assert.match(window, /sqs:GetQueueAttributes/);
    assert.match(window, /opsReadSqsArns/);
    assert.match(window, /grantOpsSqsRead\(redqueenAnnotator\)/);
    assert.match(window, /grantOpsSqsRead\(redqueenAgents\)/);
    assert.match(window, /a-search-redqueen-agents/);
    assert.doesNotMatch(window, /sqs:SendMessage/);
    assert.doesNotMatch(window, /sqs:ReceiveMessage/);
    assert.doesNotMatch(window, /sqs:DeleteMessage/);
    assert.doesNotMatch(window, /sqs:PurgeQueue/);
  });

  it('opsReadSqsArns collects provider queue+DLQ and db-backed pair', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(src, /opsReadSqsArns\.push\(queue\.queueArn, dlq\.queueArn\)/);
    assert.match(
      src,
      /opsReadSqsArns\.push\(dbBackedQueue\.queueArn, dbBackedDlq\.queueArn\)/,
    );
  });

  it('search-fanout.md documents read-only depths and no redrive', () => {
    const doc = fs.readFileSync(
      path.join(ROOT, 'docs', 'search-fanout.md'),
      'utf8',
    );
    assert.match(doc, /FR #5122/);
    assert.match(doc, /GetQueueAttributes/);
    assert.match(doc, /ListQueues/);
    assert.match(doc, /Do not redrive or purge/);
  });
});
