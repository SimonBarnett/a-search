'use strict';

/**
 * FR-059c: injectable provider selftest probe contract.
 * probe(source) -> { ok, source, latencyMs, error? }
 * Provider implementations are out of scope — this module only validates
 * the shape and runs an injected probe fn.
 */

/**
 * @typedef {{
 *   ok: boolean,
 *   source: string,
 *   latencyMs: number,
 *   error?: string,
 * }} ProbeResult
 */

/**
 * @callback ProbeFn
 * @param {string} source
 * @returns {ProbeResult|Promise<ProbeResult>}
 */

/**
 * @param {unknown} value
 * @returns {value is ProbeResult}
 */
function isProbeResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  /** @type {Record<string, unknown>} */
  const v = /** @type {Record<string, unknown>} */ (value);
  if (typeof v.ok !== 'boolean') return false;
  if (typeof v.source !== 'string' || v.source.trim() === '') return false;
  if (typeof v.latencyMs !== 'number' || !Number.isFinite(v.latencyMs) || v.latencyMs < 0) {
    return false;
  }
  if (v.error !== undefined && typeof v.error !== 'string') return false;
  if (v.ok === false && (v.error === undefined || String(v.error).trim() === '')) {
    return false;
  }
  return true;
}

/**
 * @param {unknown} value
 * @returns {ProbeResult}
 */
function assertProbeResult(value) {
  if (!isProbeResult(value)) {
    throw new TypeError(
      `assertProbeResult: expected { ok, source, latencyMs, error? }, got ${JSON.stringify(value)}`,
    );
  }
  return /** @type {ProbeResult} */ (value);
}

/**
 * @param {unknown} probe
 * @returns {asserts probe is ProbeFn}
 */
function assertProbeFn(probe) {
  if (typeof probe !== 'function') {
    throw new TypeError(
      `assertProbeFn: probe must be a function, got ${typeof probe}`,
    );
  }
}

/**
 * Run an injectable probe(source) and validate the contract result.
 * If the probe omits latencyMs, measure wall time with `now` (ms).
 *
 * @param {ProbeFn} probe
 * @param {string} source
 * @param {{ now?: () => number }} [opts]
 * @returns {Promise<ProbeResult>}
 */
async function runProbe(probe, source, opts = {}) {
  assertProbeFn(probe);
  const src = String(source == null ? '' : source).trim();
  if (!src) {
    throw new TypeError('runProbe: source id required');
  }
  const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
  const t0 = now();
  const raw = await probe(src);
  const t1 = now();

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    /** @type {Record<string, unknown>} */
    const r = /** @type {Record<string, unknown>} */ (raw);
    if (r.source === undefined) r.source = src;
    if (r.latencyMs === undefined) {
      const elapsed = t1 - t0;
      r.latencyMs = elapsed >= 0 ? elapsed : 0;
    }
  }
  return assertProbeResult(raw);
}

module.exports = {
  isProbeResult,
  assertProbeResult,
  assertProbeFn,
  runProbe,
};
