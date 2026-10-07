'use strict';

/** flexoffers provider worker stub (FR-022). */
async function run(msg) {
  if (!msg || typeof msg !== 'object') throw new Error('run(msg) requires a message object');
  return {
    ok: true,
    source: 'flexoffers',
    searchId: msg.searchId,
    env: msg.env,
    message: 'flexoffers worker stub — not wired yet',
  };
}

module.exports = { run };
