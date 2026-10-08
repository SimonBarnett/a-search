'use strict';

/**
 * FR-058a: docs/sqs-pacing.md + links from environments.md / add-source.md.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('FR-058a SQS pacing docs', () => {
  it('docs/sqs-pacing.md states maxConcurrency/pacing and 407/429 fail-when', () => {
    const p = path.join(root, 'docs', 'sqs-pacing.md');
    assert.ok(fs.existsSync(p), 'docs/sqs-pacing.md required');
    const text = fs.readFileSync(p, 'utf8');
    assert.match(text, /407/);
    assert.match(text, /429/);
    assert.match(text, /batchSize|maxConcurrency|reservedConcurrent|concurrency/i);
    assert.match(text, /Fail-when|fail-when/i);
    assert.match(text, /SQS|pacing/i);
  });

  it('environments.md and add-source.md link sqs-pacing.md', () => {
    const envDoc = fs.readFileSync(
      path.join(root, 'docs', 'environments.md'),
      'utf8',
    );
    const addDoc = fs.readFileSync(
      path.join(root, 'docs', 'add-source.md'),
      'utf8',
    );
    assert.match(envDoc, /sqs-pacing\.md/);
    assert.match(addDoc, /sqs-pacing\.md/);
  });
});
