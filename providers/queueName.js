'use strict';

/**
 * Per-source SQS queue name including env (FR-007).
 * Live and sandbox must never share a queue.
 *
 * Pattern: a-search-{sourceId}-{live|sandbox}
 */

/**
 * @param {string} sourceId
 * @param {'live'|'sandbox'} env
 * @returns {string}
 */
function queueName(sourceId, env) {
  if (!sourceId || typeof sourceId !== 'string') {
    throw new Error('queueName: sourceId required');
  }
  if (env !== 'live' && env !== 'sandbox') {
    throw new Error(
      `queueName: env must be 'live' or 'sandbox', got ${JSON.stringify(env)}`,
    );
  }
  return `a-search-${sourceId}-${env}`;
}

module.exports = { queueName };
