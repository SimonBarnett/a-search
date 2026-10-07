'use strict';

/**
 * Amazon SQS Lambda entry (FR-038).
 * Parses `event.Records[]` JSON bodies → `run(msg)`; throws for retry.
 * Unexpected fatals also call reportException (FR-048d).
 *
 * @param {{ Records?: Array<{ body: string }> }} event
 * @param {{ run?: Function, reportException?: Function, fetch?: Function }} [deps]
 */

const {
  reportException: defaultReportException,
} = require('../../../../shared/intake/reportException');

const AMAZON_ROUTE = 'providers/live/amazon/handler';

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isEnvIsolation(err) {
  return (
    err &&
    (err.name === 'EnvIsolationError' ||
      (typeof err.code === 'string' &&
        (err.code === 'env_mismatch' || err.code === 'missing_env')))
  );
}

async function handleRecords(event, deps) {
  const runFn =
    deps && typeof deps.run === 'function'
      ? deps.run
      : require('./worker').run;
  const records = (event && event.Records) || [];
  const results = [];
  for (const record of records) {
    const body = record && record.body;
    if (typeof body !== 'string') {
      throw new Error('SQS record body must be a JSON string');
    }
    let msg;
    try {
      msg = JSON.parse(body);
    } catch (err) {
      const e = new Error(
        `SQS record body is not valid JSON: ${err && err.message ? err.message : err}`,
      );
      e.cause = err;
      throw e;
    }
    results.push(await runFn(msg));
  }
  return { ok: true, results };
}

async function handler(event, deps) {
  const d = deps || {};
  const report = d.reportException || defaultReportException;
  try {
    return await handleRecords(event, d);
  } catch (err) {
    if (!isEnvIsolation(err)) {
      try {
        await report({
          err,
          route: AMAZON_ROUTE,
          source: 'amazon',
          fetch: d.fetch,
        });
      } catch {
        // Intake must not swallow the original throw (SQS retry).
      }
    }
    throw err;
  }
}

module.exports = { handler };
