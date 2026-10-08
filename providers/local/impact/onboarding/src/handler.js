'use strict';

/**
 * Lambda entry for Impact onboarding drain (FR-056c/FR-056d).
 * Invokes runOnce once per tick; EventBridge rules are FR-056e.
 */

const { runOnce } = require('./run');

/**
 * @param {object} [_event]
 * @param {object} [_context]
 * @param {object} [deps]
 */
async function handler(_event, _context, deps = {}) {
  const envVars = deps.envVars || deps.env || process.env;
  const result = await runOnce({ ...deps, envVars });
  return {
    statusCode: 200,
    body: JSON.stringify(result),
  };
}

module.exports = { handler };
