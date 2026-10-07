'use strict';

/**
 * Amazon SQS Lambda entry (FR-038).
 * Parses `event.Records[]` JSON bodies → `run(msg)`; throws for retry.
 *
 * @param {{ Records?: Array<{ body: string }> }} event
 * @param {{ run?: Function }} [deps] - injectable `run` for unit tests
 */
async function handler(event, deps) {
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

module.exports = { handler };
