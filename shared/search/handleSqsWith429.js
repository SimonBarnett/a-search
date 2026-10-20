'use strict';

/**
 * FR #4038 / #4030: SQS Lambda entry that never sends HTTP 429 straight to DLQ.
 * On 429: ChangeMessageVisibility (Retry-After), then rethrow so SQS retries.
 * FR #4438 / #4561: *_missing_credentials (and other non-retryable provider
 * skips) ack the message, ERROR-log provider+searchid (no secrets), and write
 * a zero-product status IN with error so consumers see the provider did not run.
 * FR #4544: Rakuten INVALID_CONTEXT_VALUE is a vendor client/query skip.
 */

const { backoffFor429 } = require('./backoff429');
const {
  writeLiveProviderInResult,
  resolveInPathFromMsg,
} = require('./writeLiveProviderInResult');

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
 * FR #4544: Rakuten INVALID_CONTEXT_VALUE is a vendor client/query fault.
 * Skip intake fatal (same class as missing creds); do not DLQ-loop.
 * @param {unknown} err
 * @returns {boolean}
 */
function isVendorClientSkip(err) {
  if (isMissingProviderCreds(err)) return true;
  const code = err && typeof err.code === 'string' ? err.code : '';
  if (code === 'rakuten_invalid_context') return true;
  return /INVALID_CONTEXT_VALUE/i.test(String((err && err.message) || err || ''));
}

/**
 * FR #4561: non-retryable provider skips that must ack (delete) the SQS message
 * without intake fatals or DLQ. Missing creds plus err.nonRetryable === true.
 * @param {unknown} err
 * @returns {boolean}
 */
function isNonRetryableProviderSkip(err) {
  if (isMissingProviderCreds(err)) return true;
  return !!(err && err.nonRetryable === true);
}

/**
 * Status IN `error` value: missing creds collapse to missing_credentials;
 * other non-retryable skips keep their code.
 * @param {unknown} err
 * @returns {string}
 */
function statusErrorFromSkip(err) {
  if (isMissingProviderCreds(err)) return 'missing_credentials';
  const code = err && typeof err.code === 'string' ? err.code.trim() : '';
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
 * @param {{
 *   err: unknown,
 *   msg: object,
 *   source: string,
 *   deps: object,
 *   logError?: Function,
 * }} args
 */
async function reportNonRetryableSkip(args) {
  const err = args.err;
  const msg = args.msg || {};
  const source = String(args.source || msg.source || '').trim().toLowerCase();
  const searchid = searchidFromMsg(msg);
  const code = err && typeof err.code === 'string' ? err.code : '';
  const statusError = statusErrorFromSkip(err);
  const log =
    typeof args.logError === 'function' ? args.logError : console.error.bind(console);

  // Never include secrets / tokens / Authorization in the log line.
  log(
    '[a-search]',
    'ERROR',
    statusError,
    'provider=' + (source || 'unknown'),
    'searchid=' + (searchid || 'unknown'),
    code ? 'code=' + code : '',
  );

  const pathParts = resolveInPathFromMsg(msg);
  const deps = args.deps || {};
  if (!pathParts || !source || typeof deps.putObject !== 'function') {
    return { logged: true, inWritten: false };
  }

  try {
    await writeLiveProviderInResult({
      msg,
      source,
      products: [],
      error: statusError,
      queries: msg.queries,
      exclude: msg.exclude,
      envVars: deps.env || process.env,
      putObject: deps.putObject,
      touchLastmod: deps.touchLastmod,
      headObject: deps.headObject,
      getObject: deps.getObject,
      copyObject: deps.copyObject,
      getObjectTagging: deps.getObjectTagging,
      putObjectTagging: deps.putObjectTagging,
      now: deps.now,
    });
    return { logged: true, inWritten: true };
  } catch (writeErr) {
    // Status IN is best-effort; still ack the message so we do not retry forever.
    log(
      '[a-search]',
      'ERROR',
      'status_in_write_failed',
      'provider=' + (source || 'unknown'),
      'searchid=' + (searchid || 'unknown'),
      writeErr && writeErr.message ? String(writeErr.message) : String(writeErr),
    );
    return { logged: true, inWritten: false };
  }
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
      // FR #4427: transient vendor HTTP (429/502/503/504) retries via SQS;
      // do not file intake fatals on every attempt.
      const transient = backoffFor429({ err }).is429;
      // FR #4438 / #4561: missing provider creds (and other non-retryable skips)
      // must not file an intake fatal or fail the SQS batch; log + status IN.
      if (isNonRetryableProviderSkip(err)) {
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
        await reportNonRetryableSkip({
          err,
          msg,
          source,
          deps,
          logError: opts.logError,
        });
        const skipped = isMissingProviderCreds(err)
          ? 'missing_credentials'
          : statusErrorFromSkip(err);
        results.push({
          ok: false,
          skipped,
          code: err && err.code,
          source: source || opts.source || '',
        });
        continue;
      }
      // FR #4544: vendor client skips (e.g. Rakuten INVALID_CONTEXT_VALUE).
      if (isVendorClientSkip(err)) {
        results.push({
          ok: false,
          skipped: isMissingProviderCreds(err)
            ? 'missing_credentials'
            : 'vendor_client_error',
          code: err && err.code,
          source: opts.source || '',
        });
        continue;
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
  statusErrorFromSkip,
  reportNonRetryableSkip,
};
