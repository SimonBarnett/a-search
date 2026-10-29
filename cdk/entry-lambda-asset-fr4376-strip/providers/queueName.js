'use strict';

/**
 * Per-source SQS FIFO queue name including env (FR-007 + FR #4039).
 * Live and sandbox must never share a queue.
 *
 * Pattern: a-search-provider-{sourceId}-{live|sandbox}.fifo
 * DLQ: a-search-provider-{sourceId}-{live|sandbox}-dlq.fifo
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
  return `a-search-provider-${sourceId}-${env}.fifo`;
}

/**
 * @param {string} sourceId
 * @param {'live'|'sandbox'} env
 * @returns {string}
 */
function queueDlqName(sourceId, env) {
  const q = queueName(sourceId, env);
  return q.replace(/\.fifo$/, '-dlq.fifo');
}

module.exports = { queueName, queueDlqName };
