'use strict';

/**
 * FR #4038 / #4030: SQS Lambda entry that never sends HTTP 429 straight to DLQ.
 * On 429: ChangeMessageVisibility (Retry-After), then rethrow so SQS retries.
 */

const { backoffFor429, isAmazonNonJsonFault } = require('./backoff429');

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
 * @param {{
 *   event: { Records?: Array<{ body?: string, receiptHandle?: string }> },
 *   run: (msg: object, deps?: object) => Promise<unknown>,
 *   deps?: object,
 *   changeMessageVisibility?: (args: {
 *     ReceiptHandle: string,
 *     VisibilityTimeout: number,
 *   }) => Promise<unknown>,
 *   reportException?: Function,
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
      // FR #4438: missing provider creds must not file an intake fatal or
      // fail the SQS batch (that retries and files the same issue again).
      if (isMissingProviderCreds(err)) {
        results.push({
          ok: false,
          skipped: 'missing_credentials',
          code: err.code,
          source: opts.source || '',
        });
        continue;
      }
      // FR #4562: Amazon non-JSON HTML — complete the batch (worker should
      // write status IN); do not retry into DLQ or spam intake.
      if (isAmazonNonJsonFault(err)) {
        results.push({
          ok: false,
          skipped: 'vendor_non_json',
          code: err.code,
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
};
