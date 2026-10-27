'use strict';

/**
 * FR-3951: outbound-only SQS long-poll (Receive / Delete / ChangeVisibility).
 * WaitTimeSeconds=20 matches components-piece dispatcher (#1343).
 * No inbound listener --- walrus only calls HTTPS out.
 */

const DEFAULT_WAIT_S = 20;

/**
 * @param {object} opts
 * @param {{ send: Function }} opts.client
 * @param {string} opts.queueUrl
 * @param {new (input: object) => object} [opts.ReceiveMessageCommand]
 * @param {new (input: object) => object} [opts.DeleteMessageCommand]
 * @param {new (input: object) => object} [opts.ChangeMessageVisibilityCommand]
 * @param {number} [opts.waitTimeSeconds]
 * @param {number} [opts.maxMessages]
 * @param {number} [opts.visibilityTimeout]
 */
function createSqsPoll(opts) {
  if (!opts || !opts.client || typeof opts.client.send !== 'function') {
    throw new Error('sqs_client_required');
  }
  const queueUrl = opts.queueUrl != null ? String(opts.queueUrl).trim() : '';
  if (!queueUrl) throw new Error('queue_url_required');

  let ReceiveMessageCommand = opts.ReceiveMessageCommand;
  let DeleteMessageCommand = opts.DeleteMessageCommand;
  let ChangeMessageVisibilityCommand = opts.ChangeMessageVisibilityCommand;

  function ensureCommands() {
    if (
      ReceiveMessageCommand &&
      DeleteMessageCommand &&
      ChangeMessageVisibilityCommand
    ) {
      return;
    }
    const sdk = require('@aws-sdk/client-sqs');
    if (!ReceiveMessageCommand) ReceiveMessageCommand = sdk.ReceiveMessageCommand;
    if (!DeleteMessageCommand) DeleteMessageCommand = sdk.DeleteMessageCommand;
    if (!ChangeMessageVisibilityCommand) {
      ChangeMessageVisibilityCommand = sdk.ChangeMessageVisibilityCommand;
    }
  }

  /**
   * @returns {Promise<Array<object>>}
   */
  async function receive() {
    ensureCommands();
    const wait = Number(
      opts.waitTimeSeconds != null ? opts.waitTimeSeconds : DEFAULT_WAIT_S,
    );
    const max = Number(opts.maxMessages != null ? opts.maxMessages : 1);
    const out = await opts.client.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        WaitTimeSeconds: Number.isFinite(wait) ? wait : DEFAULT_WAIT_S,
        MaxNumberOfMessages: Number.isFinite(max) && max > 0 ? max : 1,
        VisibilityTimeout:
          opts.visibilityTimeout != null
            ? Number(opts.visibilityTimeout)
            : undefined,
        AttributeNames: ['ApproximateReceiveCount'],
        MessageAttributeNames: ['All'],
      }),
    );
    return Array.isArray(out && out.Messages) ? out.Messages : [];
  }

  /**
   * @param {string} receiptHandle
   */
  async function deleteMessage(receiptHandle) {
    ensureCommands();
    const rh = receiptHandle != null ? String(receiptHandle).trim() : '';
    if (!rh) throw new Error('receipt_handle_required');
    await opts.client.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: rh,
      }),
    );
  }

  /**
   * @param {string} receiptHandle
   * @param {number} visibilityTimeout
   */
  async function changeVisibility(receiptHandle, visibilityTimeout) {
    ensureCommands();
    const rh = receiptHandle != null ? String(receiptHandle).trim() : '';
    if (!rh) throw new Error('receipt_handle_required');
    await opts.client.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: rh,
        VisibilityTimeout: Number(visibilityTimeout) || 0,
      }),
    );
  }

  return {
    receive,
    deleteMessage,
    changeVisibility,
    queueUrl,
    waitTimeSeconds: DEFAULT_WAIT_S,
  };
}

module.exports = {
  DEFAULT_WAIT_S,
  createSqsPoll,
};
