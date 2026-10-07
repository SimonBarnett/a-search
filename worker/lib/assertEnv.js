'use strict';

/**
 * Worker env stamp guard (FR-007).
 * Refuse messages whose env !== process A_SEARCH_ENV to prevent cross-env writes.
 */

class EnvIsolationError extends Error {
  /**
   * @param {'env_mismatch'|'missing_env'} code
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message || code);
    this.name = 'EnvIsolationError';
    this.code = code;
  }
}

/**
 * @param {{ env?: string }} message - SQS job payload
 * @param {string} [aSearchEnv] - defaults to process.env.A_SEARCH_ENV
 */
function assertWorkerEnv(message, aSearchEnv = process.env.A_SEARCH_ENV) {
  if (aSearchEnv !== 'live' && aSearchEnv !== 'sandbox') {
    throw new EnvIsolationError(
      'missing_env',
      'A_SEARCH_ENV must be live or sandbox',
    );
  }
  if (!message || message.env !== aSearchEnv) {
    throw new EnvIsolationError(
      'env_mismatch',
      `message.env ${JSON.stringify(message && message.env)} !== A_SEARCH_ENV ${aSearchEnv}`,
    );
  }
}

module.exports = { assertWorkerEnv, EnvIsolationError };
