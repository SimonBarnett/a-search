'use strict';

/**
 * FR #4030: 429 handling for provider workers.
 * Never send a 429 straight to the DLQ --- change visibility / reject for SQS retry.
 */

/**
 * @param {unknown} err
 * @returns {number}
 */
function httpStatusOf(err) {
  if (!err || typeof err !== 'object') return NaN;
  return Number(
    /** @type {{ status?: number, statusCode?: number, $metadata?: { httpStatusCode?: number } }} */ (
      err
    ).status ??
      /** @type {{ statusCode?: number }} */ (err).statusCode ??
      (err.$metadata && err.$metadata.httpStatusCode),
  );
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isHttp429(err) {
  if (!err || typeof err !== 'object') return false;
  if (httpStatusOf(err) === 429) return true;
  const code = String(/** @type {{ code?: string, name?: string }} */ (err).code || err.name || '');
  return /429|TooManyRequests|throttl/i.test(code);
}

/**
 * FR #4562: Amazon PA-API / Creators non-JSON HTML bodies are permanent for
 * this attempt class — do not burn three SQS receives into the DLQ.
 * @param {unknown} err
 * @returns {boolean}
 */
function isAmazonNonJsonFault(err) {
  const code = err && typeof err.code === 'string' ? err.code : '';
  return code === 'paapi_non_json' || code === 'creators_non_json';
}

/**
 * FR #4562 / #4739: permanent Amazon vendor faults (non-JSON HTML or Creators
 * AssociateNotEligible). Worker writes status IN; SQS completes; no intake spam.
 * @param {unknown} err
 * @returns {boolean}
 */
function isAmazonPermanentVendorFault(err) {
  if (isAmazonNonJsonFault(err)) return true;
  const code = err && typeof err.code === 'string' ? err.code : '';
  return code === 'creators_not_eligible';
}

/**
 * FR #4427: vendor HTML/gateway faults (502/503/504) are retryable like 429.
 * FR #4562 / #4739: Amazon permanent faults are not.
 * @param {unknown} err
 * @returns {boolean}
 */
function isTransientVendorHttp(err) {
  if (isAmazonPermanentVendorFault(err)) return false;
  if (isHttp429(err)) return true;
  const status = httpStatusOf(err);
  return status === 502 || status === 503 || status === 504;
}

/**
 * Parse Retry-After header (seconds or HTTP-date). Cap at 900s.
 * @param {unknown} raw
 * @param {number} [fallbackSec]
 * @returns {number}
 */
function parseRetryAfterSeconds(raw, fallbackSec = 30) {
  const fb =
    Number.isFinite(Number(fallbackSec)) && Number(fallbackSec) > 0
      ? Math.floor(Number(fallbackSec))
      : 30;
  if (raw == null || raw === '') return fb;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum >= 0) {
    return Math.min(900, Math.max(1, Math.floor(asNum)));
  }
  const when = Date.parse(String(raw));
  if (!Number.isFinite(when)) return fb;
  const sec = Math.ceil((when - Date.now()) / 1000);
  if (sec <= 0) return fb;
  return Math.min(900, sec);
}

/**
 * Decide visibility timeout for a 429 (SQS ChangeMessageVisibility).
 * @param {{
 *   err?: unknown,
 *   retryAfter?: unknown,
 *   headers?: Record<string, string>,
 *   fallbackSec?: number,
 * }} opts
 * @returns {{ is429: boolean, visibilityTimeout: number, reason: string }}
 */
function backoffFor429(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const headers = o.headers || {};
  const retryRaw =
    o.retryAfter != null
      ? o.retryAfter
      : headers['retry-after'] || headers['Retry-After'];
  const hit = isTransientVendorHttp(o.err) || retryRaw != null;
  if (!hit) {
    return { is429: false, visibilityTimeout: 0, reason: 'not_429' };
  }
  const visibilityTimeout = parseRetryAfterSeconds(retryRaw, o.fallbackSec);
  return { is429: true, visibilityTimeout, reason: 'http_429_backoff' };
}

module.exports = {
  httpStatusOf,
  isHttp429,
  isAmazonNonJsonFault,
  isAmazonPermanentVendorFault,
  isTransientVendorHttp,
  parseRetryAfterSeconds,
  backoffFor429,
};
