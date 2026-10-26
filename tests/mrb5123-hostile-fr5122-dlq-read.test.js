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
    const i = src.indexOf('overnight verification needs DLQ depth');
    assert.ok(i >= 0, 'FR #5122/#5131 DLQ depth comment missing');
    const window = src.slice(Math.max(0, i - 80), i + 1400);
    assert.match(window, /sid: 'OpsReadProviderDlq'/);
    assert.match(window, /sqs:GetQueueAttributes/);
    assert.match(window, /opsReadSqsWildcard/);
    assert.match(window, /a-search-\*/);
    assert.match(window, /#5131/);
    assert.match(window, /grantOpsSqsRead\(redqueenAnnotator\)/);
    assert.match(window, /grantOpsSqsRead\(redqueenAgents\)/);
    assert.match(window, /a-search-redqueen-agents/);
    assert.doesNotMatch(window, /sqs:SendMessage/);
    assert.doesNotMatch(window, /sqs:ReceiveMessage/);
    assert.doesNotMatch(window, /sqs:DeleteMessage/);
    assert.doesNotMatch(window, /sqs:PurgeQueue/);
  });

  it('GetQueueAttributes uses stack queue-name prefix wildcard (FR #5131)', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(
      src,
      /opsReadSqsWildcard =\s*`arn:aws:sqs:\$\{this\.region\}:\$\{this\.account\}:a-search-\*`/,
    );
    assert.doesNotMatch(src, /opsReadSqsArns/);
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

  it('search-fanout FIFO sentence not split by FR #5122 insert', () => {
    const doc = fs.readFileSync(
      path.join(ROOT, 'docs', 'search-fanout.md'),
      'utf8',
    );
    assert.match(
      doc,
      /MessageDeduplicationId` on those FIFO\s+URLs only\./,
    );
    assert.doesNotMatch(
      doc,
      /MessageDeduplicationId` on those FIFO\s+FR #5122/,
    );
  });
});
