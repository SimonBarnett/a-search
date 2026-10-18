'use strict';

/**
 * Default AWS SQS SendMessage for entry fan-out (FR-032).
 * FR-3950: kind:local (DB-backed) sources resolve SQS_DB_BACKED_* (one queue);
 * kind:live keep per-source queueEnv. Tests inject sendMessage or a mock SQS client.
 */

const { loadRegistry } = require('../../providers/loadRegistry');
const { resolveQueueUrl } = require('../../providers/resolveQueueUrl');
const { queueEnvForSource } = require('./dbBackedQueue');

/**
 * @param {{
 *   envVars?: Record<string, string|undefined>,
 *   sqsClient?: { send: (cmd: object) => Promise<object> },
 *   SendMessageCommand?: new (input: object) => object,
 *   loadRegistry?: typeof loadRegistry,
 *   resolveQueueUrl?: typeof resolveQueueUrl,
 * }} [opts]
 * @returns {(payload: object) => Promise<void>}
 */
function createSqsSendMessage(opts = {}) {
  const envVars = opts.envVars || process.env;
  const resolve = opts.resolveQueueUrl || resolveQueueUrl;
  const load = opts.loadRegistry || loadRegistry;

  let client = opts.sqsClient || null;
  let SendMessageCommand = opts.SendMessageCommand || null;

  function ensureClient() {
    if (client && SendMessageCommand) return;
    // Lazy require so injected tests never load the SDK.
    const sdk = require('@aws-sdk/client-sqs');
    if (!SendMessageCommand) SendMessageCommand = sdk.SendMessageCommand;
    if (!client) client = new sdk.SQSClient({});
  }

  return async function sendMessage(payload) {
    if (!payload || !payload.source || !payload.env) {
      throw new Error('sendMessage payload requires source and env');
    }
    const { sources } = load();
    const entry = (sources || []).find((s) => s && s.id === payload.source);
    if (!entry) {
      throw new Error(`registry missing source ${payload.source}`);
    }
    let queueEnv;
    try {
      queueEnv = queueEnvForSource(entry);
    } catch (err) {
      throw new Error(
        `registry missing queueEnv for source ${payload.source}: ${err.message}`,
      );
    }
    const queueUrl = resolve({
      queueEnv,
      env: payload.env,
      envVars,
    });

    ensureClient();
    const cmd = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(payload),
    });
    await client.send(cmd);
  };
}

module.exports = { createSqsSendMessage };
