'use strict';

/**
 * Default AWS SQS SendMessage for entry fan-out (FR-032).
 * Tests inject sendMessage or a mock SQS client; production uses @aws-sdk/client-sqs.
 */

const { loadRegistry } = require('../../providers/loadRegistry');
const { resolveQueueUrl } = require('../../providers/resolveQueueUrl');

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
    if (!entry || !entry.queueEnv) {
      throw new Error(`registry missing queueEnv for source ${payload.source}`);
    }
    const queueUrl = resolve({
      queueEnv: entry.queueEnv,
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
