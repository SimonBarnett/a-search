'use strict';

/**
 * Impact local provider worker stub (FR-021 scaffold).
 * Live path: SELECT dbo.Parts WHERE Source='impact' AND Env=@env.
 *
 * @param {object} msg - SQS fan-out payload
 * @returns {Promise<{ ok: boolean, source: string, searchId?: string, message: string }>}
 */
async function run(msg) {
  if (!msg || typeof msg !== 'object') {
    throw new Error('run(msg) requires a message object');
  }
  return {
    ok: true,
    source: 'impact',
    searchId: msg.searchId,
    env: msg.env,
    message:
      'impact worker stub â€” MSSQL Parts SELECT not wired yet; maintainer owns feed MERGE',
  };
}


/**
 * SQS Lambda entry (FR-036). Parses Records and calls run(msg).
 * @param {{ Records?: Array<{ body: string }> }} event
 */
async function handler(event) {
  const records = (event && event.Records) || [];
  const results = [];
  for (const record of records) {
    const body = record && record.body;
    const msg = typeof body === 'string' ? JSON.parse(body) : body;
    results.push(await run(msg));
  }
  return { ok: true, results };
}
module.exports = {
  handler,
  run,
};
