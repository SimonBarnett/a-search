'use strict';

/** wix provider worker stub (FR-607). */
async function run(msg) {
  if (!msg || typeof msg !== 'object') throw new Error('run(msg) requires a message object');
  return {
    ok: true,
    source: 'wix',
    searchId: msg.searchId,
    env: msg.env,
    message: 'wix worker stub - not wired yet',
  };
}

module.exports = { run };
