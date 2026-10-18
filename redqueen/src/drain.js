'use strict';

/**
 * FR #3987: drain a-clubs-new-folders.fifo --- outbound pull only.
 */

const { processFolderEvent } = require('./annotate');

/**
 * @param {{
 *   receiveMessage: Function,
 *   deleteMessage: Function,
 *   changeMessageVisibility?: Function,
 *   queueUrl: string,
 *   headObject: Function,
 *   getObject?: Function,
 *   putObject: Function,
 *   listObjectsV2?: Function,
 *   reviewHost?: Function,
 *   reviewGuid?: Function,
 *   now?: () => Date,
 *   maxMessages?: number,
 *   waitTimeSeconds?: number,
 *   visibilityRetrySeconds?: number,
 * }} opts
 * @returns {Promise<{ processed: number, actions: object[] }>}
 */
async function drainOnce(opts) {
  if (!opts || typeof opts.receiveMessage !== 'function') {
    throw new Error('receiveMessage required');
  }
  if (typeof opts.deleteMessage !== 'function') {
    throw new Error('deleteMessage required');
  }
  const QueueUrl = opts.queueUrl;
  const resp = await opts.receiveMessage({
    QueueUrl,
    MaxNumberOfMessages: opts.maxMessages || 5,
    WaitTimeSeconds: opts.waitTimeSeconds == null ? 5 : opts.waitTimeSeconds,
    VisibilityTimeout: 60,
  });
  const messages = (resp && resp.Messages) || [];
  const actions = [];
  for (const msg of messages) {
    const result = await processFolderEvent({
      body: msg.Body,
      headObject: opts.headObject,
      getObject: opts.getObject,
      putObject: opts.putObject,
      listObjectsV2: opts.listObjectsV2,
      reviewHost: opts.reviewHost,
      reviewGuid: opts.reviewGuid,
      now: opts.now,
    });
    actions.push({ messageId: msg.MessageId, ...result });
    if (result.action === 'retry') {
      if (typeof opts.changeMessageVisibility === 'function') {
        await opts.changeMessageVisibility({
          QueueUrl,
          ReceiptHandle: msg.ReceiptHandle,
          VisibilityTimeout:
            opts.visibilityRetrySeconds == null
              ? 30
              : opts.visibilityRetrySeconds,
        });
      }
      continue;
    }
    await opts.deleteMessage({
      QueueUrl,
      ReceiptHandle: msg.ReceiptHandle,
    });
  }
  return { processed: messages.length, actions };
}

module.exports = {
  drainOnce,
};
