'use strict';

/**
 * FR #5122: redqueen annotator/agents can read provider DLQ depths.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

describe('FR #5122 ops read-only DLQ IAM', () => {
  it('CDK grants GetQueueAttributes + ListQueues to annotator and agents', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(src, /FR #5122/);
    assert.match(src, /sqs:GetQueueAttributes/);
    assert.match(src, /sqs:ListQueues/);
    assert.match(src, /a-search-redqueen-annotator/);
    assert.match(src, /a-search-redqueen-agents/);
    assert.match(src, /ImportedRedqueenAgents/);
    assert.doesNotMatch(src, /sqs:SendMessage[\s\S]{0,80}OpsReadProviderDlq/);
  });

  it('rakuten worker still writes DONE via writeLiveProviderInResult (0 products)', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'providers', 'live', 'rakuten', 'src', 'worker.js'),
      'utf8',
    );
    assert.match(src, /writeLiveProviderInResult/);
    const shared = fs.readFileSync(
      path.join(ROOT, 'shared', 'search', 'writeLiveProviderInResult.js'),
      'utf8',
    );
    assert.match(shared, /recordServicedDone/);
    assert.match(shared, /products\.length === 0/);
  });
});
