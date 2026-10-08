'use strict';

/**
 * Lambda entry for awin onboarding drain (FR-056b sandbox / FR-056a live).
 * EventBridge (later) or direct invoke → runOnce until remaining=0 semantics
 * are owned by the shared drain helper; this handler is a single runOnce.
 */

const { runOnce } = require('./run');

/**
 * @param {object} [event]
 * @param {object} [context]
 */
async function handler(event, context) {
  const out = await runOnce({
    event,
    context,
    envVars: process.env,
  });
  return out;
}

module.exports = { handler };
