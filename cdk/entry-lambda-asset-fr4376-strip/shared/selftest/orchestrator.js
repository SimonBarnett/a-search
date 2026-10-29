'use strict';

/**
 * FR-059d: selftest orchestrator — probe each enabled registry source for env.
 * Intake filing is out of scope (later FR-059 slice).
 *
 * @typedef {{ ok: boolean, source: string, latencyMs: number, error?: string }} ProbeResult
 * @typedef {(source: string) => ProbeResult|Promise<ProbeResult>} ProbeFn
 * @typedef {(env: 'live'|'sandbox') => string[]} ListEnabledFn
 */

/**
 * Normalize a probe return into the FR-059c shape (soft; full assert is probeContract).
 * @param {string} source
 * @param {unknown} raw
 * @returns {ProbeResult}
 */
function normalizeResult(source, raw) {
  const src = String(source);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      source: src,
      latencyMs: 0,
      error: 'invalid_probe_result',
    };
  }
  /** @type {Record<string, unknown>} */
  const r = /** @type {Record<string, unknown>} */ (raw);
  const ok = r.ok === true;
  const latencyMs = Number(r.latencyMs);
  const out = {
    ok,
    source: typeof r.source === 'string' && r.source.trim() ? r.source : src,
    latencyMs: Number.isFinite(latencyMs) && latencyMs >= 0 ? latencyMs : 0,
  };
  if (!ok) {
    out.error =
      typeof r.error === 'string' && r.error.trim()
        ? r.error
        : 'probe_failed';
  } else if (typeof r.error === 'string' && r.error.trim()) {
    out.error = r.error;
  }
  return out;
}

/**
 * Run injectable probes for enabled sources (disabled skipped).
 *
 * @param {{
 *   env: 'live'|'sandbox',
 *   sources?: string[],
 *   probe: ProbeFn,
 *   listEnabled: ListEnabledFn,
 * }} opts
 * @returns {Promise<{
 *   env: string,
 *   providers: ProbeResult[],
 *   failed: string[],
 * }>}
 */
async function runSelftestOrchestrator(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new TypeError('runSelftestOrchestrator: opts object required');
  }
  const env = opts.env;
  if (env !== 'live' && env !== 'sandbox') {
    throw new TypeError(
      `runSelftestOrchestrator: env must be 'live' or 'sandbox', got ${JSON.stringify(env)}`,
    );
  }
  if (typeof opts.probe !== 'function') {
    throw new TypeError('runSelftestOrchestrator: probe function required');
  }
  if (typeof opts.listEnabled !== 'function') {
    throw new TypeError(
      'runSelftestOrchestrator: listEnabled function required',
    );
  }

  const enabledIds = opts.listEnabled(env);
  if (!Array.isArray(enabledIds)) {
    throw new TypeError('runSelftestOrchestrator: listEnabled must return string[]');
  }

  let ids = enabledIds.map((id) => String(id));
  if (Array.isArray(opts.sources)) {
    const want = new Set(opts.sources.map((s) => String(s)));
    // Only probe sources that are both requested and enabled for env.
    ids = ids.filter((id) => want.has(id));
  }

  /** @type {ProbeResult[]} */
  const providers = [];
  for (const id of ids) {
    let raw;
    try {
      raw = await opts.probe(id);
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String(/** @type {{ message: unknown }} */ (err).message)
          : 'probe_threw';
      providers.push({
        ok: false,
        source: id,
        latencyMs: 0,
        error: msg.slice(0, 200) || 'probe_threw',
      });
      continue;
    }
    providers.push(normalizeResult(id, raw));
  }

  return {
    env,
    providers,
    failed: providers.filter((p) => !p.ok).map((p) => p.source),
  };
}

module.exports = {
  runSelftestOrchestrator,
  normalizeResult,
};
