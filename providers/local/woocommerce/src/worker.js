'use strict';

/** woocommerce provider worker stub (FR-607). */
async function run(msg) {
  if (!msg || typeof msg !== 'object') throw new Error('run(msg) requires a message object');
  return {
    ok: true,
    source: 'woocommerce',
    searchId: msg.searchId,
    env: msg.env,
    message: 'woocommerce worker stub - not wired yet',
  };
}

module.exports = { run };
