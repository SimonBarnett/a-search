'use strict';

/**
 * FR #4038 / #4030: SQS Lambda entry that never sends HTTP 429 straight to DLQ.
 * On 429: ChangeMessageVisibility (Retry-After), then rethrow so SQS retries.
 */

const { backoffFor429 } = require('./backoff429');

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
 * FR #4437: provider credential gaps (*_missing_credentials / *CredsError) are
 * deploy/ops config — SQS still retries/DLQ, but intake must not get a fatal
 * on every attempt (same class as env isolation; cf. FR #4427 transient skip).
 * @param {unknown} err
 * @returns {boolean}
 */
function isMissingCredentials(err) {
  if (!err || typeof err !== 'object') return false;
  const code = typeof err.code === 'string' ? err.code : '';
  if (/_missing_credentials$/i.test(code) || code === 'missing_credentials') {
    return true;
  }
  const name = typeof err.name === 'string' ? err.name : '';
  if (/CredsError$/i.test(name)) return true;
  const msg = typeof err.message === 'string' ? err.message : '';
  if (/credentials missing/i.test(msg) || /missing_credentials/i.test(msg)) {
    return true;
  }
  return false;
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
      // FR #4437: missing provider credentials are ops/config — skip intake spam.
      const transient = backoffFor429({ err }).is429;
      if (
        !transient &&
        !isEnvIsolation(err) &&
        !isMissingCredentials(err) &&
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
  isMissingCredentials,
};
