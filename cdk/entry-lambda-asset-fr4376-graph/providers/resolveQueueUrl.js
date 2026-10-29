'use strict';

/**
 * Resolve registry queueEnv + A_SEARCH_ENV to a concrete SQS queue URL (FR-032/034).
 * Prefer SQS_<SOURCE>_<ENV>_URL, then fall back to SQS_<SOURCE>_URL.
 */

class QueueUrlError extends Error {
  /**
   * @param {'missing_queue_url'|'bad_queue_env'} code
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message || code);
    this.name = 'QueueUrlError';
    this.code = code;
  }
}

/**
 * @param {{
 *   queueEnv: string,
 *   env: 'live'|'sandbox',
 *   envVars?: Record<string, string|undefined>,
 * }} opts
 * @returns {string}
 */
function resolveQueueUrl(opts) {
  const queueEnv = opts.queueEnv;
  const env = opts.env;
  const envVars = opts.envVars || process.env;

  if (!queueEnv || typeof queueEnv !== 'string') {
    throw new QueueUrlError('bad_queue_env', 'queueEnv required');
  }
  if (env !== 'live' && env !== 'sandbox') {
    throw new QueueUrlError(
      'bad_queue_env',
      `env must be live|sandbox, got ${JSON.stringify(env)}`,
    );
  }

  const m = /^SQS_(.+)_URL$/i.exec(queueEnv.trim());
  if (!m) {
    throw new QueueUrlError(
      'bad_queue_env',
      `queueEnv must look like SQS_<SOURCE>_URL, got ${JSON.stringify(queueEnv)}`,
    );
  }
  const sourceToken = m[1];
  const preferred = `SQS_${sourceToken}_${env.toUpperCase()}_URL`;
  const url = (envVars[preferred] || envVars[queueEnv] || '').trim();
  if (!url) {
    throw new QueueUrlError(
      'missing_queue_url',
      `missing queue URL env ${preferred} (or fallback ${queueEnv})`,
    );
  }
  return url;
}

module.exports = { resolveQueueUrl, QueueUrlError };
