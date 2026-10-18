'use strict';

/**
 * MRB #3953 hostile pins for FR #3950: fail-closed missing DB queue URL;
 * staged entry asset must ship dbBackedQueue.js.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createSqsSendMessage } = require('../entry/src/sqsSend');
const { queueEnvForSource } = require('../entry/src/dbBackedQueue');

const ROOT = path.join(__dirname, '..');

describe('MRB-3953 hostile DB-backed enqueue', () => {
  it('missing SQS_DB_BACKED_* URL fails closed for kind:local', async () => {
    const sendMessage = createSqsSendMessage({
      envVars: {
        SQS_AMAZON_LIVE_URL: 'https://sqs.example/amazon-live',
      },
      sqsClient: { send: async () => ({}) },
      SendMessageCommand: class {
        constructor(input) {
          this.input = input;
        }
      },
      loadRegistry: () => ({
        sources: [{ id: 'awin', kind: 'local', queueEnv: 'SQS_AWIN_URL' }],
      }),
    });

    await assert.rejects(
      () =>
        sendMessage({
          source: 'awin',
          env: 'live',
          searchId: 's',
          userId: 'u',
        }),
      /missing queue URL env SQS_DB_BACKED_LIVE_URL/,
    );
  });

  it('queueEnvForSource ignores per-source queueEnv for kind:local', () => {
    assert.equal(
      queueEnvForSource({ kind: 'local', queueEnv: 'SQS_AWIN_URL' }),
      'SQS_DB_BACKED_URL',
    );
  });

  it('stage-entry-lambda-asset requires dbBackedQueue.js', () => {
    const text = fs.readFileSync(
      path.join(ROOT, 'scripts/stage-entry-lambda-asset.js'),
      'utf8',
    );
    assert.match(text, /entry\/src\/dbBackedQueue\.js/);
  });
});
