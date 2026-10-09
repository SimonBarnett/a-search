'use strict';

/**
 * MRB #1173 hostile pins for FR-142 SQS DLQ + redrive (product PR #1173).
 * Vision S4 / Phase-3 ops safety: poison messages leave worker queues.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('MRB-1173 hostile FR-142 SQS DLQ', () => {
  it('stack contiguous FR-142 DLQ name + retention 14d + maxReceiveCount 3 + outputs', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /FR-142/);
    const i = text.indexOf('FR-142');
    assert.ok(i >= 0);
    const window = text.slice(i, i + 900);
    assert.match(window, /DeadLetterQueue/);
    assert.match(window, /\$\{qName\}-dlq|`-dlq`|-dlq`/);
    assert.match(window, /retentionPeriod:\s*cdk\.Duration\.days\(14\)/);
    assert.match(window, /deadLetterQueue\s*:/);
    assert.match(window, /maxReceiveCount:\s*3/);
    assert.match(text, /DeadLetterQueueUrl/);
    assert.match(text, /description:\s*`FR-142 DLQ/);
    // Alarms stay out of this FR
    assert.doesNotMatch(window, /Alarm|alarm/);
  });

  it('product pin + Decision LOCKED + release-gap SQS DLQ Yes + cdk README', () => {
    assert.ok(
      fs.existsSync(path.join(root, 'tests', 'fr142-sqs-dlq.test.js')),
      'tests/fr142-sqs-dlq.test.js required',
    );
    const product = fs.readFileSync(
      path.join(root, 'tests', 'fr142-sqs-dlq.test.js'),
      'utf8',
    );
    assert.match(product, /RedrivePolicy/);
    assert.match(product, /maxReceiveCount/);
    assert.match(product, /ENABLED_IDS/);

    const fr = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-142.md'), 'utf8');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /maxReceiveCount:\s*3|maxReceiveCount.*3/);
    assert.match(fr, /14\s*days|retention 14/i);
    assert.match(fr, /FR-143/);

    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-aws-installable-2026-10-09.md'),
      'utf8',
    );
    assert.match(gap, /\|\s*SQS DLQ\s*\|\s*\*\*Yes\*\*[^\n]*FR-142/i);

    const cdkReadme = fs.readFileSync(
      path.join(root, 'cdk', 'README.md'),
      'utf8',
    );
    assert.match(cdkReadme, /FR-142/);
    assert.match(cdkReadme, /maxReceiveCount\s*=\s*3|maxReceiveCount=3/);
  });
});
