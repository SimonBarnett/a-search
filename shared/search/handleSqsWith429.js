'use strict';

/**
 * FR #4038 / #4030: SQS Lambda entry that never sends HTTP 429 straight to DLQ.
 * On 429: ChangeMessageVisibility (Retry-After), then rethrow so SQS retries.
 * FR #4438 / #4561: *_missing_credentials ack the message, ERROR-log, and write
 * a zero-product status IN (config skip at worker — not an API failure).
 * FR #4769: provider API failures must NOT write an IN file; log and fail into
 * the provider DLQ (no intake-fatal spam).
 * FR #4782: nonRetryable / permanent client faults SendMessage to the DLQ and
 * DeleteMessage on the first failure (do not burn maxReceiveCount 3 / ~18 min).
 * Retryable 429 / 502-504 keep throw + visibility backoff.
 */

const {
  backoffFor429,
  isAmazonPermanentVendorFault,
  isTransientVendorHttp,
  httpStatusOf,
} = require('./backoff429');
const {
  writeLiveProviderInResult,
  resolveInPathFromMsg,
} = require('./writeLiveProviderInResult');
const { recordSearchTerminal } = require('./searchDone');

/** CDK worker / db-backed queues use maxReceiveCount 3 (FR-142). */
const DEFAULT_MAX_RECEIVE_COUNT = 3;

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isEnvIsolation(err) {
  return (
    !!err &&
    (err.name === 'EnvIsolationError' ||
      (typeof err.code === 'string' &&
        (err.code === 'env_mismatch' || err.code === 'missing_env')))
  );
}

/**
 * FR #4438: a live provider with no API key is configuration, not a code fatal.
 * Code ends with `_missing_credentials` (skimlinks, amazon, and the same class).
 * @param {unknown} err
 * @returns {boolean}
 */
function isMissingProviderCreds(err) {
  const code = err && typeof err.code === 'string' ? err.code : '';
  return /_missing_credentials$/.test(code);
}

/**
 * @param {unknown} err
 * @returns {string}
 */
function providerFaultCode(err) {
  const code = err && typeof err.code === 'string' ? err.code.trim() : '';
  return code || '';
}

/**
 * FR #4769: API / vendor faults that must reach the DLQ (no status IN, no intake).
 * Missing credentials stay a config skip (FR #4650 / #4561).
 * @param {unknown} err
 * @returns {boolean}
 */
function isProviderFaultForDlq(err) {
  if (!err || isMissingProviderCreds(err) || isEnvIsolation(err)) return false;
  if (isAmazonPermanentVendorFault(err)) return true;
  const code = providerFaultCode(err);
  if (
    code === 'cj_not_authorised' ||
    code === 'rakuten_invalid_context' ||
    /INVALID_CONTEXT_VALUE/i.test(String((err && err.message) || ''))
  ) {
    return true;
  }
  if (err && err.nonRetryable === true) return true;
  const status = httpStatusOf(err);
  // Non-success HTTP that is not a paced 429/transient gateway retry class.
  if (Number.isFinite(status) && status >= 400 && !backoffFor429({ err }).is429) {
    return true;
  }
  return false;
}

/**
 * FR #4782: faults that must hit the DLQ on the first receive (no SQS redrive wait).
 * Transient 429/502/503/504 stay on the throw + visibility path.
 * @param {unknown} err
 * @returns {boolean}
 */
function isImmediateDlqFault(err) {
  if (!isProviderFaultForDlq(err)) return false;
  if (isTransientVendorHttp(err)) return false;
  if (err && err.nonRetryable === true) return true;
  if (isAmazonPermanentVendorFault(err)) return true;
  const code = providerFaultCode(err);
  if (
    code === 'cj_not_authorised' ||
    code === 'rakuten_invalid_context' ||
    /INVALID_CONTEXT_VALUE/i.test(String((err && err.message) || ''))
  ) {
    return true;
  }
  const status = httpStatusOf(err);
  // Client 4xx (auth/eligibility/bad request) are final; hard 5xx keep redrive.
  return Number.isFinite(status) && status >= 400 && status < 500;
}

/**
 * @param {object} record
 * @returns {string}
 */
function messageGroupIdFromRecord(record) {
  const attrs = (record && record.attributes) || {};
  const g = attrs.MessageGroupId || attrs.messageGroupId;
  if (g != null && String(g).trim()) return String(g).trim();
  return 'provider';
}

/**
 * @param {object} record
 * @returns {number}
 */
function receiveCountFromRecord(record) {
  const attrs = (record && record.attributes) || {};
  const n = Number(
    attrs.ApproximateReceiveCount != null
      ? attrs.ApproximateReceiveCount
      : attrs.approximateReceiveCount,
  );
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * FR #4917: write DONE status=dlq (fail-soft) when host/guid/searchid present.
 * @param {object} args
 */
async function recordDlqDone(args) {
  const msg = args.msg || {};
  const pathParts = resolveInPathFromMsg(msg);
  if (!pathParts || typeof args.putObject !== 'function') return null;
  try {
    return await recordSearchTerminal({
      hostkey: pathParts.hostkey,
      guid: pathParts.guid,
      searchid: pathParts.searchid,
      source: args.source || msg.source,
      status: 'dlq',
      products: 0,
      envVars: args.envVars || process.env,
      putObject: args.putObject,
      getObject: args.getObject,
      headObject: args.headObject,
      copyObject: args.copyObject,
      getObjectTagging: args.getObjectTagging,
      putObjectTagging: args.putObjectTagging,
      now: args.now,
      logError: args.logError,
    });
  } catch (err) {
    const log =
      typeof args.logError === 'function'
        ? args.logError
        : console.error.bind(console);
    log(
      '[a-search]',
      'WARN',
      'search_done_dlq_write_failed',
      String((err && err.message) || err),
    );
    return null;
  }
}

/**
 * Move a poison message to the sibling DLQ and delete it from the source queue.
 * FR #4917 / FR #5198: also writes _search-done/{searchid}/{source}.json status=dlq when S3 deps present.
 * @param {{
 *   record: object,
 *   err: unknown,
 *   msg?: object,
 *   source?: string,
 *   sendMessage: Function,
 *   deleteMessage: Function,
 *   queueUrl: string,
 *   dlqUrl: string,
 *   putObject?: Function,
 *   getObject?: Function,
 *   headObject?: Function,
 *   copyObject?: Function,
 *   getObjectTagging?: Function,
 *   putObjectTagging?: Function,
 *   envVars?: Record<string, string|undefined>,
 *   logError?: Function,
 *   now?: Date|string|number,
 * }} args
 */
async function moveMessageToDlq(args) {
  const record = args.record || {};
  const err = args.err;
  const msg = args.msg || {};
  const source = String(args.source || msg.source || '').trim() || 'unknown';
  const code = providerFaultCode(err) || 'provider_error';
  const status = httpStatusOf(err);
  const searchid = searchidFromMsg(msg) || 'unknown';
  const body =
    typeof record.body === 'string' && record.body
      ? record.body
      : JSON.stringify(msg || {});
  const dedupe = [
    source,
    searchid,
    code,
    String(Date.now()),
    String(Math.floor(Math.random() * 1e9)),
  ].join('-');
  const messageAttributes = {
    ErrorCode: { DataType: 'String', StringValue: String(code).slice(0, 256) },
    Provider: { DataType: 'String', StringValue: String(source).slice(0, 256) },
    SearchId: {
      DataType: 'String',
      StringValue: String(searchid).slice(0, 256),
    },
  };
  if (Number.isFinite(status)) {
    messageAttributes.HttpStatus = {
      DataType: 'Number',
      StringValue: String(status),
    };
  }
  await args.sendMessage({
    QueueUrl: args.dlqUrl,
    MessageBody: body,
    MessageGroupId: messageGroupIdFromRecord(record),
    MessageDeduplicationId: dedupe.slice(0, 128),
    MessageAttributes: messageAttributes,
  });
  await args.deleteMessage({
    QueueUrl: args.queueUrl,
    ReceiptHandle: record.receiptHandle,
  });
  // FR #4917: terminal DONE for immediate DLQ (after SQS move so a DONE failure
  // does not strand the poison message on the primary queue).
  await recordDlqDone({ ...args, msg, source });
}

/**
 * Lazy AWS SDK SQS SendMessage / DeleteMessage when not injected (Lambda).
 * @returns {{ sendMessage: Function, deleteMessage: Function }}
 */
function buildDefaultSqsFns() {
  let client;
  function getClient() {
    if (!client) {
      const { SQSClient } = require('@aws-sdk/client-sqs');
      client = new SQSClient({});
    }
    return client;
  }
  return {
    sendMessage: async (input) => {
      const { SendMessageCommand } = require('@aws-sdk/client-sqs');
      return getClient().send(new SendMessageCommand(input));
    },
    deleteMessage: async (input) => {
      const { DeleteMessageCommand } = require('@aws-sdk/client-sqs');
      return getClient().send(new DeleteMessageCommand(input));
    },
  };
}

/**
 * @param {object} opts
 * @param {object} record
 * @returns {{ sendMessage: Function, deleteMessage: Function, queueUrl: string, dlqUrl: string }|null}
 */
function resolveImmediateDlqDeps(opts, record) {
  const deps = (opts && opts.deps) || {};
  const env =
    (deps.env && typeof deps.env === 'object' ? deps.env : null) || process.env;
  const queueUrl = String(
    opts.queueUrl || deps.queueUrl || env.SQS_QUEUE_URL || '',
  ).trim();
  const dlqUrl = String(
    opts.dlqUrl || deps.dlqUrl || env.SQS_DLQ_URL || '',
  ).trim();
  if (
    !queueUrl ||
    !dlqUrl ||
    !record ||
    typeof record.receiptHandle !== 'string' ||
    !record.receiptHandle
  ) {
    return null;
  }
  let sendMessage =
    typeof opts.sendMessage === 'function'
      ? opts.sendMessage
      : typeof deps.sendMessage === 'function'
        ? deps.sendMessage
        : null;
  let deleteMessage =
    typeof opts.deleteMessage === 'function'
      ? opts.deleteMessage
      : typeof deps.deleteMessage === 'function'
        ? deps.deleteMessage
        : null;
  if (!sendMessage || !deleteMessage) {
    const built = buildDefaultSqsFns();
    sendMessage = sendMessage || built.sendMessage;
    deleteMessage = deleteMessage || built.deleteMessage;
  }
  return { sendMessage, deleteMessage, queueUrl, dlqUrl };
}

/**
 * FR #4917: S3 fns for DONE writes (from opts, deps, or Lambda default chain).
 * @param {object} opts
 * @returns {object}
 */
function resolveDoneS3Deps(opts) {
  const deps = (opts && opts.deps) || {};
  const env =
    (deps.env && typeof deps.env === 'object' ? deps.env : null) ||
    opts.envVars ||
    process.env;
  const pick = (name) => {
    if (typeof opts[name] === 'function') return opts[name];
    if (typeof deps[name] === 'function') return deps[name];
    return null;
  };
  let putObject = pick('putObject');
  let getObject = pick('getObject');
  let headObject = pick('headObject');
  let copyObject = pick('copyObject');
  let getObjectTagging = pick('getObjectTagging');
  let putObjectTagging = pick('putObjectTagging');
  if (!putObject) {
    try {
      const { attachDefaultS3 } = require('./liveWorkerS3');
      const built = attachDefaultS3({});
      putObject = putObject || built.putObject;
      getObject = getObject || built.getObject;
      headObject = headObject || built.headObject;
      copyObject = copyObject || built.copyObject;
      getObjectTagging = getObjectTagging || built.getObjectTagging;
      putObjectTagging = putObjectTagging || built.putObjectTagging;
    } catch {
      // No AWS SDK in unit fixtures — DONE write is skipped.
    }
  }
  return {
    putObject,
    getObject,
    headObject,
    copyObject,
    getObjectTagging,
    putObjectTagging,
    envVars: env,
  };
}

/**
 * Status IN `error` value for missing-creds config skips only.
 * @param {unknown} err
 * @returns {string}
 */
function statusErrorFromSkip(err) {
  if (isMissingProviderCreds(err)) return 'missing_credentials';
  const code = providerFaultCode(err);
  return code || 'provider_error';
}

/**
 * @param {object} msg
 * @returns {string}
 */
function searchidFromMsg(msg) {
  if (!msg || typeof msg !== 'object') return '';
  return String(msg.searchid || msg.searchId || '').trim();
}

/**
 * CloudWatch-safe failure log (no secrets).
 * @param {{
 *   err: unknown,
 *   msg?: object,
 *   source?: string,
 *   logError?: Function,
 * }} args
 */
function logProviderFailure(args) {
  const err = args.err;
  const msg = args.msg || {};
  const source = String(args.source || msg.source || '').trim().toLowerCase();
  const searchid = searchidFromMsg(msg);
  const host = String(msg.hostkey || msg.host || '').trim();
  const guid = String(msg.guid || '').trim();
  const code = providerFaultCode(err);
  const status = httpStatusOf(err);
  const log =
    typeof args.logError === 'function' ? args.logError : console.error.bind(console);
  const parts = [
    '[a-search]',
    'ERROR',
    'provider_failure',
    'provider=' + (source || 'unknown'),
    'searchid=' + (searchid || 'unknown'),
  ];
  if (host) parts.push('host=' + host);
  if (guid) parts.push('guid=' + guid);
  if (Number.isFinite(status)) parts.push('httpStatus=' + status);
  if (code) parts.push('code=' + code);
  const message = err && err.message ? String(err.message).slice(0, 300) : String(err);
  // Strip anything that looks like a bearer/token fragment.
  parts.push('message=' + message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]'));
  log(...parts);
}

/**
 * @param {{
 *   err: unknown,
 *   msg: object,
 *   source: string,
 *   deps: object,
 *   logError?: Function,
 * }} args
 */
async function reportMissingCredentialsSkip(args) {
  const err = args.err;
  const msg = args.msg || {};
  const source = String(args.source || msg.source || '').trim().toLowerCase();
  const searchid = searchidFromMsg(msg);
  const code = providerFaultCode(err);
  const statusError = statusErrorFromSkip(err);
  const log =
    typeof args.logError === 'function' ? args.logError : console.error.bind(console);

  log(
    '[a-search]',
    'ERROR',
    statusError,
    'provider=' + (source || 'unknown'),
    'searchid=' + (searchid || 'unknown'),
    code ? 'code=' + code : '',
  );

  // FR #4823: missing_credentials acks with ERROR log only; no zero-product status IN.
  return { logged: true, inWritten: false };
}

/** @deprecated FR #4769 — only missing_credentials use the skip path. */
function isNonRetryableProviderSkip(err) {
  return isMissingProviderCreds(err);
}

/** @deprecated FR #4769 — vendor client faults go to DLQ. */
function isVendorClientSkip(err) {
  if (isMissingProviderCreds(err)) return true;
  return isProviderFaultForDlq(err);
}

/**
 * @param {{
 *   event: { Records?: Array<{ body?: string, receiptHandle?: string }> },
 *   run: (msg: object, deps?: object) => Promise<unknown>,
 *   deps?: object,
 *   changeMessageVisibility?: (args: {
 *     ReceiptHandle: string,
 *     VisibilityTimeout: number,
 *   }) => Promise<unknown>,
 *   reportException?: Function,
 *   logError?: Function,
 *   route?: string,
 *   source?: string,
 * }} opts
 */
async function handleSqsWith429(opts) {
  if (!opts || typeof opts.run !== 'function') {
    throw new Error('handleSqsWith429 requires run');
  }
  const event = opts.event || {};
  const deps = opts.deps || {};
  const records = event.Records || [];
  const results = [];

  for (const record of records) {
    try {
      const body = record && record.body;
      if (typeof body !== 'string') {
        throw new Error('SQS record body must be a JSON string');
      }
      let msg;
      try {
        msg = JSON.parse(body);
      } catch (err) {
        const detail = err && err.message ? err.message : String(err);
        const e = new Error('SQS record body is not valid JSON: ' + detail);
        e.cause = err;
        throw e;
      }

      try {
        results.push(await opts.run(msg, deps));
      } catch (err) {
        const b = backoffFor429({ err });
        if (
          b.is429 &&
          typeof opts.changeMessageVisibility === 'function' &&
          record &&
          typeof record.receiptHandle === 'string' &&
          record.receiptHandle
        ) {
          await opts.changeMessageVisibility({
            ReceiptHandle: record.receiptHandle,
            VisibilityTimeout: b.visibilityTimeout,
          });
        }
        throw err;
      }
    } catch (err) {
      // FR #4427: transient vendor HTTP (429/502/503/504) uses visibility backoff above; hard faults fall through.
      const transient = backoffFor429({ err }).is429;

      // FR #4438 / #4561: missing provider creds — config skip, not API failure.
      if (isMissingProviderCreds(err)) {
        let msg = {};
        try {
          if (record && typeof record.body === 'string') {
            msg = JSON.parse(record.body);
          }
        } catch {
          msg = {};
        }
        const source = String(
          opts.source || (msg && msg.source) || '',
        ).trim();
        await reportMissingCredentialsSkip({
          err,
          msg,
          source,
          deps,
          logError: opts.logError,
        });
        // FR #4917: config skip is a terminal "serviced" finish (0 products).
        const pathParts = resolveInPathFromMsg(msg);
        if (pathParts) {
          const s3 = resolveDoneS3Deps(opts);
          if (typeof s3.putObject === 'function') {
            try {
              await recordSearchTerminal({
                ...s3,
                hostkey: pathParts.hostkey,
                guid: pathParts.guid,
                searchid: pathParts.searchid,
                source,
                status: 'serviced',
                products: 0,
                logError: opts.logError,
              });
            } catch {
              // fail-soft
            }
          }
        }
        results.push({
          ok: false,
          skipped: 'missing_credentials',
          code: err && err.code,
          source: source || opts.source || '',
        });
        continue;
      }

      // FR #4769 / #4782: API faults — log, no IN, no intake.
      // Immediate DLQ (send+delete) for nonRetryable/permanent client faults;
      // else throw so SQS redrive / visibility backoff can finish the job.
      if (isProviderFaultForDlq(err)) {
        let msg = {};
        try {
          if (record && typeof record.body === 'string') {
            msg = JSON.parse(record.body);
          }
        } catch {
          msg = {};
        }
        const source = String(
          opts.source || (msg && msg.source) || '',
        ).trim();
        logProviderFailure({
          err,
          msg,
          source,
          logError: opts.logError,
        });
        if (isImmediateDlqFault(err)) {
          const dlqDeps = resolveImmediateDlqDeps(opts, record);
          if (dlqDeps) {
            const s3 = resolveDoneS3Deps(opts);
            await moveMessageToDlq({
              record,
              err,
              msg,
              source,
              sendMessage: dlqDeps.sendMessage,
              deleteMessage: dlqDeps.deleteMessage,
              queueUrl: dlqDeps.queueUrl,
              dlqUrl: dlqDeps.dlqUrl,
              ...s3,
              logError: opts.logError,
            });
            results.push({
              ok: false,
              deadLettered: true,
              code: providerFaultCode(err) || err.code,
              source: source || opts.source || '',
            });
            continue;
          }
        }
        // FR #4917: on the final receive (maxReceiveCount), write DONE=dlq
        // before throw — SQS redrive itself runs no Lambda code.
        const maxReceive =
          Number(opts.maxReceiveCount) > 0
            ? Math.floor(Number(opts.maxReceiveCount))
            : DEFAULT_MAX_RECEIVE_COUNT;
        if (receiveCountFromRecord(record) >= maxReceive) {
          const s3 = resolveDoneS3Deps(opts);
          await recordDlqDone({
            ...s3,
            msg,
            source,
            logError: opts.logError,
          });
        }
        throw err;
      }

      // FR #4917: transient 429/502-504 are not isProviderFaultForDlq, but on the
      // final receive SQS will redrive to the DLQ with no Lambda code. Write
      // DONE=dlq here so hasresults can still complete.
      if (transient) {
        const maxReceive =
          Number(opts.maxReceiveCount) > 0
            ? Math.floor(Number(opts.maxReceiveCount))
            : DEFAULT_MAX_RECEIVE_COUNT;
        if (receiveCountFromRecord(record) >= maxReceive) {
          let msg = {};
          try {
            if (record && typeof record.body === 'string') {
              msg = JSON.parse(record.body);
            }
          } catch {
            msg = {};
          }
          const source = String(
            opts.source || (msg && msg.source) || '',
          ).trim();
          const s3 = resolveDoneS3Deps(opts);
          await recordDlqDone({
            ...s3,
            msg,
            source,
            logError: opts.logError,
          });
        }
      }

      if (
        !transient &&
        !isEnvIsolation(err) &&
        typeof opts.reportException === 'function'
      ) {
        try {
          await opts.reportException({
            err,
            route: opts.route,
            source: opts.source,
            fetch: deps.fetch,
          });
        } catch {
          // Intake must not swallow the original throw (SQS retry).
        }
      }
      throw err;
    }
  }

  return { ok: true, results };
}

module.exports = {
  handleSqsWith429,
  isEnvIsolation,
  isMissingProviderCreds,
  isNonRetryableProviderSkip,
  isVendorClientSkip,
  isProviderFaultForDlq,
  isImmediateDlqFault,
  moveMessageToDlq,
  receiveCountFromRecord,
  recordDlqDone,
  DEFAULT_MAX_RECEIVE_COUNT,
  statusErrorFromSkip,
  logProviderFailure,
  reportNonRetryableSkip: reportMissingCredentialsSkip,
  reportMissingCredentialsSkip,
};
