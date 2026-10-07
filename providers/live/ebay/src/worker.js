'use strict';

/**
 * eBay live provider worker stub (FR-017 scaffold).
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
    source: 'ebay',
    searchId: msg.searchId,
    env: msg.env,
    message:
      'ebay worker stub — Browse API client not wired yet; no remote call',
  };
}

module.exports = { run };
