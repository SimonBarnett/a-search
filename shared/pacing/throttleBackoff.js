'use strict';

/**
 * FR-058d: classify provider HTTP 407/429 and backoff before failing
 * so SQS can retry without a tight in-process loop.
 */

class ProviderThrottleError extends Error {
  /**
   * @param {string} message
   * @param {{
   *   status: number,
   *   retryAfterMs: number,
   *   code?: string,
   * }} detail
   */
  constructor(message, detail) {
    super(message);
    this.name = 'ProviderThrottleError';
    this.status = detail && detail.status;
    this.retryAfterMs = detail && detail.retryAfterMs;
    this.code = (detail && detail.code) || 'provider_throttle';
  }
}

/**
 * @param {number} status
 * @returns {boolean}
 */
function isThrottleStatus(status) {
  const n = Number(status);
  return n === 407 || n === 429;
}

/**
 * Parse Retry-After header (delta-seconds or HTTP-date) to milliseconds.
 * @param {string|number|undefined|null} value
 * @param {() => number} [now]
 * @returns {number|undefined}
 */
function parseRetryAfterMs(value, now = () => Date.now()) {
  if (value == null || value === '') return undefined;
  const raw = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const sec = Number(raw);
    if (!Number.isFinite(sec) || sec < 0) return undefined;
    return Math.ceil(sec * 1000);
  }
  const when = Date.parse(raw);
  if (!Number.isFinite(when)) return undefined;
  const ms = when - now();
  return ms > 0 ? ms : 0;
}

/**
 * Read Retry-After from a headers map (Headers, plain object, or get()).
 * @param {object|undefined|null} headers
 * @returns {string|undefined}
 */
function getRetryAfterHeader(headers) {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') {
    return headers.get('retry-after') || headers.get('Retry-After') || undefined;
  }
  const keys = Object.keys(headers);
  for (const k of keys) {
    if (String(k).toLowerCase() === 'retry-after') {
      return headers[k];
    }
  }
  return undefined;
}

/**
 * @param {{
 *   status?: number,
 *   statusCode?: number,
 *   headers?: object,
 * }} res
 * @param {{
 *   defaultBackoffMs?: number,
 *   maxBackoffMs?: number,
 *   now?: () => number,
 * }} [opts]
 * @returns {{
 *   throttle: boolean,
 *   status?: number,
 *   retryAfterMs?: number,
 * }}
 */
function classifyHttpThrottle(res, opts = {}) {
  const status = Number(
    res && (res.status != null ? res.status : res.statusCode),
  );
  if (!isThrottleStatus(status)) {
    return { throttle: false, status: Number.isFinite(status) ? status : undefined };
  }
  const defaultBackoffMs =
    opts.defaultBackoffMs != null ? Number(opts.defaultBackoffMs) : 1000;
  const maxBackoffMs =
    opts.maxBackoffMs != null ? Number(opts.maxBackoffMs) : 60_000;
  const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
  let retryAfterMs = parseRetryAfterMs(getRetryAfterHeader(res && res.headers), now);
  if (retryAfterMs == null || !Number.isFinite(retryAfterMs)) {
    retryAfterMs = Number.isFinite(defaultBackoffMs) ? defaultBackoffMs : 1000;
  }
  if (Number.isFinite(maxBackoffMs) && retryAfterMs > maxBackoffMs) {
    retryAfterMs = maxBackoffMs;
  }
  if (retryAfterMs < 0) retryAfterMs = 0;
  return { throttle: true, status, retryAfterMs };
}

/**
 * If response is 407/429: sleep retryAfter (or default), then throw
 * ProviderThrottleError so the Lambda fails and SQS can retry later.
 * Returns false when not a throttle response (caller continues).
 *
 * @param {{
 *   status?: number,
 *   statusCode?: number,
 *   headers?: object,
 * }} res
 * @param {{
 *   sleep?: (ms: number) => Promise<void>,
 *   defaultBackoffMs?: number,
 *   maxBackoffMs?: number,
 *   now?: () => number,
 * }} [opts]
 * @returns {Promise<false>}
 */
async function backoffOnHttpThrottle(res, opts = {}) {
  const classified = classifyHttpThrottle(res, opts);
  if (!classified.throttle) return false;

  const sleep =
    typeof opts.sleep === 'function'
      ? opts.sleep
      : (ms) =>
          new Promise((resolve) => {
            setTimeout(resolve, ms);
          });

  const waitMs = classified.retryAfterMs || 0;
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  throw new ProviderThrottleError(
    `provider HTTP ${classified.status} throttle; backed off ${waitMs}ms`,
    {
      status: classified.status,
      retryAfterMs: waitMs,
      code: 'provider_throttle',
    },
  );
}

module.exports = {
  ProviderThrottleError,
  isThrottleStatus,
  parseRetryAfterMs,
  classifyHttpThrottle,
  backoffOnHttpThrottle,
};
