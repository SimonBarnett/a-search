'use strict';

/**
 * Amazon live provider worker stub (FR-016 scaffold).
 * FR-030 lands the recorded-fixture HTTP search client.
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
    source: 'amazon',
    searchId: msg.searchId,
    env: msg.env,
    message:
      'amazon worker stub — live search client lands in FR-030; no PA-API call yet',
  };
}

module.exports = { run };
