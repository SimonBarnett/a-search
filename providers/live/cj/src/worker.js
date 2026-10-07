'use strict';

/** cj provider worker stub (FR-022). */
async function run(msg) {
  if (!msg || typeof msg !== 'object') throw new Error('run(msg) requires a message object');
  return {
    ok: true,
    source: 'cj',
    searchId: msg.searchId,
    env: msg.env,
    message: 'cj worker stub — not wired yet',
  };
}

module.exports = { run };
