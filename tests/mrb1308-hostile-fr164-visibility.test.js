'use strict';

/** Hostile pins for MRB #1308 / FR-164 SQS visibilityTimeout 6x worker timeout. */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const stack = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const fr = path.join(root, 'docs', 'fr', 'FR-164.md');
const gap = path.join(root, 'docs', 'release-gap-pass2-2026-10-09.md');
const pin = path.join(root, 'tests', 'fr164-sqs-visibility-timeout.test.js');

describe('MRB-1308 hostile FR-164 SQS visibilityTimeout', () => {
  it('stack contiguous FR-164 constants and 6x wiring', () => {
    const text = fs.readFileSync(stack, 'utf8');
    assert.ok(text.includes('FR-164: worker Lambda timeout'));
    assert.ok(
      text.includes(
        'const WORKER_QUEUE_VISIBILITY_TIMEOUT_SEC = WORKER_LAMBDA_TIMEOUT_SEC * 6',
      ),
    );
    assert.ok(text.includes('WORKER_LAMBDA_TIMEOUT_SEC = 60'));
    assert.ok(
      text.includes(
        'visibilityTimeout: cdk.Duration.seconds(\n            WORKER_QUEUE_VISIBILITY_TIMEOUT_SEC',
      ) ||
        text.includes(
          'visibilityTimeout: cdk.Duration.seconds(\r\n            WORKER_QUEUE_VISIBILITY_TIMEOUT_SEC',
        ),
    );
    assert.ok(
      text.includes('timeout: cdk.Duration.seconds(WORKER_LAMBDA_TIMEOUT_SEC)'),
    );
    assert.ok(!text.startsWith('\uFEFF'));
  });

  it('Decision LOCKED, product pin present, release-gap Yes', () => {
    const frText = fs.readFileSync(fr, 'utf8');
    assert.match(frText, /Decision\s*\(?\s*LOCKED\)?/i);
    assert.ok(frText.includes('fr164-sqs-visibility-timeout.test.js'));
    assert.ok(frText.includes('WORKER_QUEUE_VISIBILITY_TIMEOUT_SEC'));
    assert.ok(fs.existsSync(pin), 'missing tests/fr164-sqs-visibility-timeout.test.js');

    const gapText = fs.readFileSync(gap, 'utf8');
    assert.match(
      gapText,
      /visibilityTimeout <= worker timeout \| FR-164 \| #1007 \(\*\*Yes\*\* - visibility 6x timeout 360s; pin fr164\)/,
    );
    assert.ok(!gapText.startsWith('\uFEFF'));
  });
});
