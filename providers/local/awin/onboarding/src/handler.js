'use strict';

/**
 * Lambda entry for Awin onboarding drain (FR-056a live / FR-056b sandbox).
 * Invokes runOnce once per tick; EventBridge cadence is FR-056e.
 */

const { runOnce } = require('./run');

/**
 * @param {object} [_event]
 * @param {object} [_context]
 * @param {object} [deps]
 */
async function handler(_event, _context, deps = {}) {
  const env = deps.env || deps.envVars || process.env;
  const result = await runOnce({ ...deps, env });
  return {
    statusCode: 200,
    body: JSON.stringify(result),
  };
}

module.exports = { handler };
