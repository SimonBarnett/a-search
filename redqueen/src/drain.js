'use strict';

/**
 * FR #3987 / #4098: drain a-clubs-new-folders.fifo --- outbound pull only.
 */

const { processFolderEvent } = require('./annotate');
const { REVIEWER_TIMEOUT_MS } = require('./reviewers');
const { withSocketRetry } = require('./socketRetry');

/** FR #4236: receive visibility must exceed the grok reviewer timeout (120s). */
const RECEIVE_VISIBILITY_SEC = 180;

/**
 * FR #4246: FIFO is one group per host; receive a single message so idle
 * receipts in a batch cannot expire while only the current message is heartbeated.
 */
const DEFAULT_MAX_MESSAGES = 1;

function wrapSocket(fn) {
  if (typeof fn !== 'function') return fn;
  return (input) => withSocketRetry(() => fn(input));
}

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
    MaxNumberOfMessages:
      opts.maxMessages == null ? DEFAULT_MAX_MESSAGES : opts.maxMessages,
    WaitTimeSeconds: opts.waitTimeSeconds == null ? 5 : opts.waitTimeSeconds,
    VisibilityTimeout:
      opts.visibilityTimeoutSeconds == null
        ? RECEIVE_VISIBILITY_SEC
        : opts.visibilityTimeoutSeconds,
  });
  const messages = (resp && resp.Messages) || [];
  const actions = [];
  const visSec =
    opts.visibilityTimeoutSeconds == null
      ? RECEIVE_VISIBILITY_SEC
      : opts.visibilityTimeoutSeconds;
  const beatMs =
    opts.visibilityHeartbeatMs == null ? 30000 : opts.visibilityHeartbeatMs;
  const io = {
    headObject: wrapSocket(opts.headObject),
    getObject: wrapSocket(opts.getObject),
    putObject: wrapSocket(opts.putObject),
    listObjectsV2: wrapSocket(opts.listObjectsV2),
    copyObject: wrapSocket(opts.copyObject),
    putObjectAnnotation: wrapSocket(opts.putObjectAnnotation),
    getObjectAnnotation: wrapSocket(opts.getObjectAnnotation),
    listObjectAnnotations: wrapSocket(opts.listObjectAnnotations),
  };
  for (const msg of messages) {
    let beat;
    if (typeof opts.changeMessageVisibility === 'function' && beatMs > 0) {
      const extend = () =>
        opts.changeMessageVisibility({
          QueueUrl,
          ReceiptHandle: msg.ReceiptHandle,
          VisibilityTimeout: visSec,
        });
      beat = setInterval(() => {
        extend().catch(() => {});
      }, beatMs);
      if (typeof beat.unref === 'function') beat.unref();
    }
    let result;
    try {
    result = await processFolderEvent({
      body: msg.Body,
      headObject: io.headObject,
      getObject: io.getObject,
      putObject: io.putObject,
      listObjectsV2: io.listObjectsV2,
      copyObject: io.copyObject,
      putObjectAnnotation: io.putObjectAnnotation,
      getObjectAnnotation: io.getObjectAnnotation,
      listObjectAnnotations: io.listObjectAnnotations,
      reviewHost: opts.reviewHost,
      reviewGuid: opts.reviewGuid,
      onNewFolder: opts.onNewFolder,
      now: opts.now,
      bucket: opts.bucket,
      fetchImpl: opts.fetchImpl,
      fetchTimeoutMs: opts.fetchTimeoutMs,
      fetchMaxBytes: opts.fetchMaxBytes,
    });
    } finally {
      if (beat) clearInterval(beat);
    }
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
    await withSocketRetry(() =>
      opts.deleteMessage({
        QueueUrl,
        ReceiptHandle: msg.ReceiptHandle,
      }),
    );
  }
  return { processed: messages.length, actions };
}

module.exports = {
  drainOnce,
  RECEIVE_VISIBILITY_SEC,
  DEFAULT_MAX_MESSAGES,
  REVIEWER_TIMEOUT_MS,
};
