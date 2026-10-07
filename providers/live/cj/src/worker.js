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
      'cj worker stub — GraphQL client for ads.api.cj.com not wired yet',
  };
}

module.exports = { run };
