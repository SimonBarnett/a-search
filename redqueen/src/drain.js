'use strict';

/**
 * FR #3987 / #4098: drain a-clubs-new-folders.fifo --- outbound pull only.
 */

const { processFolderEvent } = require('./annotate');
const { handleChangeEvent } = require('./changeHandler');
const { parseChangeEvent } = require('../../shared/aClubs/changeEvents');
const { REVIEWER_TIMEOUT_MS } = require('./reviewers');
const { withSocketRetry } = require('./socketRetry');

/** FR #4827: long-poll. Empty receives must not add another sleep on top. */
const DEFAULT_WAIT_TIME_SECONDS = 20;

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
    WaitTimeSeconds:
      opts.waitTimeSeconds == null ? DEFAULT_WAIT_TIME_SECONDS : opts.waitTimeSeconds,
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
    const shared = {
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
      postSearch: opts.postSearch,
      onNewFolder: opts.onNewFolder,
      now: opts.now,
      bucket: opts.bucket,
      fetchImpl: opts.fetchImpl,
      fetchTimeoutMs: opts.fetchTimeoutMs,
      fetchMaxBytes: opts.fetchMaxBytes,
      reannotate: opts.reannotate,
      selfEtags: opts.selfEtags,
      processFolderEvent: opts.processFolderEvent,
    };
    if (bodyLooksLikeChange(msg.Body)) {
      let parsed = null;
      let invalid = false;
      try {
        parsed = parseChangeEvent(msg.Body);
      } catch {
        invalid = true;
      }
      if (invalid) {
        result = { action: 'skipped', detail: 'invalid_change_event' };
      } else if (!parsed) {
        result = { action: 'skipped', detail: 'excluded_key' };
      } else {
        result = await handleChangeEvent({ ...shared, event: parsed });
      }
    } else {
      result = await processFolderEvent({ ...shared, body: msg.Body });
    }
    } catch (err) {
      // FR #4889: one bad message must not abort the rest of the receive batch.
      result = {
        action: 'retry',
        detail: (err && (err.code || err.message)) || 'handler_error',
      };
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

/**
 * @param {unknown} body
 * @returns {boolean}
 */
function bodyLooksLikeChange(body) {
  let obj = body;
  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      return false;
    }
  }
  if (!obj || typeof obj !== 'object') return false;
  if (obj.detail && obj.detail.object && obj.detail.object.key != null) return true;
  if (Array.isArray(obj.Records) && obj.Records[0] && obj.Records[0].s3) return true;
  if (typeof obj.Message === 'string' && obj.Message.indexOf('"key"') !== -1) return true;
  if (typeof obj.key === 'string' && obj.host == null) return true;
  if (obj.kind && obj.key) return true;
  return false;
}

/**
 * Poll the folder FIFO and, when set, the a-clubs-changes queue.
 * @param {object} opts
 * @returns {Promise<{ processed: number, actions: object[] }>}
 */
async function drainDual(opts) {
  if (!opts || typeof opts !== 'object') throw new Error('drainDual opts required');
  const queueUrls = [];
  if (opts.queueUrl) queueUrls.push(String(opts.queueUrl));
  const extra = opts.changesQueueUrl || opts.changesQueue;
  if (extra && queueUrls.indexOf(String(extra)) === -1) queueUrls.push(String(extra));
  if (Array.isArray(opts.queueUrls)) {
    for (let i = 0; i < opts.queueUrls.length; i += 1) {
      const u = opts.queueUrls[i];
      if (u && queueUrls.indexOf(String(u)) === -1) queueUrls.push(String(u));
    }
  }
  if (!queueUrls.length) throw new Error('queue_url_required');
  let processed = 0;
  const actions = [];
  for (let i = 0; i < queueUrls.length; i += 1) {
    const once = await drainOnce({ ...opts, queueUrl: queueUrls[i] });
    processed += once.processed;
    if (once.actions) {
      for (let j = 0; j < once.actions.length; j += 1) {
        actions.push({ queueUrl: queueUrls[i], ...once.actions[j] });
      }
    }
  }
  return { processed, actions };
}

module.exports = {
  drainOnce,
  drainDual,
  bodyLooksLikeChange,
  RECEIVE_VISIBILITY_SEC,
  DEFAULT_MAX_MESSAGES,
  DEFAULT_WAIT_TIME_SECONDS,
  REVIEWER_TIMEOUT_MS,
};
