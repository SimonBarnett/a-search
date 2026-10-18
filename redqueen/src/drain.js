'use strict';

/**
 * FR #3987 / #4098: drain a-clubs-new-folders.fifo --- outbound pull only.
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
 *   copyObject?: Function,
 *   putObjectAnnotation: Function,
 *   getObjectAnnotation?: Function,
 *   listObjectAnnotations?: Function,
 *   reviewHost?: Function,
 *   reviewGuid?: Function,
 *   onNewFolder?: Function,
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
      copyObject: opts.copyObject,
      putObjectAnnotation: opts.putObjectAnnotation,
      getObjectAnnotation: opts.getObjectAnnotation,
      listObjectAnnotations: opts.listObjectAnnotations,
      reviewHost: opts.reviewHost,
      reviewGuid: opts.reviewGuid,
      onNewFolder: opts.onNewFolder,
      now: opts.now,
      bucket: opts.bucket,
      fetchImpl: opts.fetchImpl,
      fetchTimeoutMs: opts.fetchTimeoutMs,
      fetchMaxBytes: opts.fetchMaxBytes,
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
    // Per-GUID retry inside host_processed: leave message if any guid asked retry
    const guidRetry = (result.guids || []).some((g) => g.action === 'retry');
    if (guidRetry) {
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
