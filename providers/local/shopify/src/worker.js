'use strict';

/** shopify provider worker stub (FR-607). */
async function run(msg) {
  if (!msg || typeof msg !== 'object') throw new Error('run(msg) requires a message object');
  return {
    ok: true,
    source: 'shopify',
    searchId: msg.searchId,
    env: msg.env,
    message: 'shopify worker stub - not wired yet',
  };
}

module.exports = { run };
