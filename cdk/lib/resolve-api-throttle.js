'use strict';

/**
 * FR-157: HTTP API stage throttle defaults (context-overridable).
 *
 * Context keys (cdk -c):
 *   apiThrottleRate   steady-state requests/sec (default 20)
 *   apiThrottleBurst  burst limit (default 40)
 *
 * Conservative defaults protect worker queues; WAF is OOS.
 */

const DEFAULT_RATE = 20;
const DEFAULT_BURST = 40;

/**
 * @param {unknown} raw
 * @param {number} fallback
 * @param {string} label
 * @returns {number}
 */
function parsePositiveNumber(raw, fallback, label) {
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) {
    const err = new Error(
      `FR-157: invalid ${label}=${JSON.stringify(raw)}; expected a positive number.`,
    );
    err.code = 'A_SEARCH_INVALID_API_THROTTLE';
    throw err;
  }
  return n;
}

/**
 * @param {Record<string, unknown>} [context]
 * @returns {{ rateLimit: number, burstLimit: number }}
 */
function resolveApiThrottle(context) {
  const ctx = context || {};
  return {
    rateLimit: parsePositiveNumber(
      ctx.apiThrottleRate,
      DEFAULT_RATE,
      'apiThrottleRate',
    ),
    burstLimit: parsePositiveNumber(
      ctx.apiThrottleBurst,
      DEFAULT_BURST,
      'apiThrottleBurst',
    ),
  };
}

module.exports = {
  resolveApiThrottle,
  DEFAULT_RATE,
  DEFAULT_BURST,
};
