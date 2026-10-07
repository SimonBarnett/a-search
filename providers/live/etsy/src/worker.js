'use strict';

/** etsy provider worker stub (FR-022). */
async function run(msg) {
  if (!msg || typeof msg !== 'object') throw new Error('run(msg) requires a message object');
  return {
    ok: true,
    source: 'etsy',
    searchId: msg.searchId,
    env: msg.env,
    message: 'etsy worker stub — not wired yet',
  };
}

module.exports = { run };
