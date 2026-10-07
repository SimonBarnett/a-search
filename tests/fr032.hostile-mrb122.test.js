'use strict';

/** Hostile pins for MRB a-search#122 / FR-032 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { resolveQueueUrl } = require('../providers/resolveQueueUrl');

describe('MRB #122 hostile: FR-032 default SQS SendMessage', () => {
  it('docs/mrb-122.md pins default SendMessage + resolveQueueUrl + dual SDK deps', () => {
    const text = fs.readFileSync(path.join(root, 'docs', 'mrb-122.md'), 'utf8');
    assert.match(text, /client-sqs|SendMessage/);
    assert.match(text, /resolveQueueUrl|SQS_<SOURCE>_<ENV>_URL/);
    assert.match(text, /client-s3/);
    assert.match(text, /noop/);
  });

  it('enqueue.js defaults via createSqsSendMessage (not empty noop)', () => {
    const text = fs.readFileSync(
      path.join(root, 'entry', 'src', 'enqueue.js'),
      'utf8',
    );
    assert.match(text, /createSqsSendMessage/);
    assert.doesNotMatch(
      text,
      /sendMessage\s*=\s*async\s*\(\)\s*=>\s*\{\s*\}/,
    );
  });

  it('package.json single dependencies has client-sqs and client-s3', () => {
    const raw = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
    const depKeys = (raw.match(/"dependencies"\s*:/g) || []).length;
    assert.equal(depKeys, 1, 'exactly one dependencies key');
    const pkg = JSON.parse(raw);
    assert.ok(pkg.dependencies['@aws-sdk/client-sqs']);
    assert.ok(pkg.dependencies['@aws-sdk/client-s3']);
  });

  it('resolveQueueUrl falls back to SQS_<SOURCE>_URL when env-specific missing', () => {
    const url = resolveQueueUrl({
      queueEnv: 'SQS_AMAZON_URL',
      env: 'live',
      envVars: {
        SQS_AMAZON_URL: 'https://sqs.example/amazon-fallback',
      },
    });
    assert.equal(url, 'https://sqs.example/amazon-fallback');
  });

  it('sqsSend.js module exists and uses SendMessageCommand', () => {
    const text = fs.readFileSync(
      path.join(root, 'entry', 'src', 'sqsSend.js'),
      'utf8',
    );
    assert.match(text, /@aws-sdk\/client-sqs/);
    assert.match(text, /SendMessageCommand/);
    assert.match(text, /resolveQueueUrl/);
  });
});
