'use strict';

/**
 * CJ live provider worker stub (FR-019 scaffold).
 * Live GraphQL calls go to ads.api.cj.com when the client FR lands.
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
    source: 'cj',
    searchId: msg.searchId,
    env: msg.env,
    message:
      'cj worker stub â€” GraphQL client for ads.api.cj.com not wired yet',
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
