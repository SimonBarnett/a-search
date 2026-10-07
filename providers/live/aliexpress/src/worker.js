'use strict';

/** aliexpress provider worker stub (FR-022). */
async function run(msg) {
  if (!msg || typeof msg !== 'object') throw new Error('run(msg) requires a message object');
  return {
    ok: true,
    source: 'aliexpress',
    searchId: msg.searchId,
    env: msg.env,
    message: 'aliexpress worker stub — not wired yet',
  };
}

module.exports = { run };
