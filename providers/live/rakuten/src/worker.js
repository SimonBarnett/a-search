'use strict';

/**
 * Rakuten live provider worker stub (FR-018 scaffold).
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
    source: 'rakuten',
    searchId: msg.searchId,
    env: msg.env,
    message:
      'rakuten worker stub — Product Search XML client not wired yet; honour rate limits when live',
  };
}

module.exports = { run };
