'use strict';

/**
 * FR-034: resolve registry queueEnv → live/sandbox SQS URL.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { resolveQueueUrl, QueueUrlError } = require('../providers/resolveQueueUrl');

const root = path.join(__dirname, '..');

describe('FR-034 resolveQueueUrl', () => {
  it('live picks *_LIVE_URL over fallback', () => {
    const url = resolveQueueUrl({
      queueEnv: 'SQS_AMAZON_URL',
      env: 'live',
      envVars: {
        SQS_AMAZON_LIVE_URL: 'https://sqs.example/amazon-live',
        SQS_AMAZON_SANDBOX_URL: 'https://sqs.example/amazon-sandbox',
        SQS_AMAZON_URL: 'https://sqs.example/amazon-fallback',
      },
    });
    assert.equal(url, 'https://sqs.example/amazon-live');
  });

  it('sandbox picks *_SANDBOX_URL', () => {
    const url = resolveQueueUrl({
      queueEnv: 'SQS_EBAY_URL',
      env: 'sandbox',
      envVars: {
        SQS_EBAY_SANDBOX_URL: 'https://sqs.example/ebay-sandbox',
      },
    });
    assert.equal(url, 'https://sqs.example/ebay-sandbox');
  });

  it('falls back to SQS_<SOURCE>_URL when env-specific missing', () => {
    const url = resolveQueueUrl({
      queueEnv: 'SQS_AWIN_URL',
      env: 'live',
      envVars: { SQS_AWIN_URL: 'https://sqs.example/awin-only' },
    });
    assert.equal(url, 'https://sqs.example/awin-only');
  });

  it('missing URL → clear QueueUrlError (no silent noop)', () => {
    assert.throws(
      () =>
        resolveQueueUrl({
          queueEnv: 'SQS_AMAZON_URL',
          env: 'live',
          envVars: {},
        }),
      (err) => err instanceof QueueUrlError && err.code === 'missing_queue_url',
    );
  });

  it('docs + CDK align on SQS_<SOURCE>_<ENV>_URL', () => {
    const envDoc = fs.readFileSync(path.join(root, 'docs', 'environments.md'), 'utf8');
    const add = fs.readFileSync(path.join(root, 'docs', 'add-source.md'), 'utf8');
    const cdkReadme = fs.readFileSync(path.join(root, 'cdk', 'README.md'), 'utf8');
    const stack = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(envDoc, /resolveQueueUrl|SQS_<SOURCE>_LIVE_URL/i);
    assert.match(add, /resolveQueueUrl|SQS_<SOURCE>_LIVE_URL/i);
    assert.match(cdkReadme, /SQS_.*_LIVE_URL|resolveQueueUrl/i);
    assert.match(stack, /SQS_AMAZON_LIVE_URL/);
    assert.match(stack, /SQS_AMAZON_SANDBOX_URL/);
    assert.ok(fs.existsSync(path.join(root, 'providers', 'resolveQueueUrl.js')));
  });
});
