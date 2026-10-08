'use strict';

/**
 * FR-059j: Awin local selftest probe — MSSQL Parts reachable or feed config present.
 * Other providers are out of scope.
 */

const {
  AwinMssqlConfigError,
  mssqlConfigFromEnv,
  defaultConnect,
} = require('./queryParts');

const PROBE_SQL = `
SELECT TOP (1) 1 AS ok
FROM dbo.Parts
WHERE Source = N'awin'
  AND DeletedAt IS NULL
`.trim();

/**
 * @param {Record<string, string|undefined>} env
 * @returns {boolean}
 */
function hasFeedConfig(env) {
  const e = env || {};
  const token = e.AWIN_API_TOKEN != null ? String(e.AWIN_API_TOKEN).trim() : '';
  return Boolean(token);
}

/**
 * Lightweight Parts reachability check (injectable connect).
 * @param {object} config
 * @param {{
 *   connect?: Function,
 *   sqlTypes?: { NVarChar?: unknown },
 * }} deps
 */
async function probePartsReachable(config, deps = {}) {
  const connect =
    deps && typeof deps.connect === 'function' ? deps.connect : defaultConnect;
  const pool = await connect(config);
  try {
    if (typeof pool.request !== 'function') {
      throw new Error('awin_mssql_bad_pool');
    }
    const result = await pool.request().query(PROBE_SQL);
    const rows = (result && result.recordset) || [];
    return Array.isArray(rows);
  } finally {
    if (pool && typeof pool.close === 'function') {
      await Promise.resolve(pool.close()).catch(() => {});
    }
  }
}

/**
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   now?: () => number,
 *   connect?: Function,
 * }} [deps]
 * @returns {Promise<{ ok: boolean, source: string, latencyMs: number, error?: string }>}
 */
async function probeAwinSelftest(deps = {}) {
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const t0 = now();
  const source = 'awin';
  const env = deps.env || process.env;

  const elapsed = () => {
    const ms = now() - t0;
    return Number.isFinite(ms) && ms >= 0 ? ms : 0;
  };

  const feedOk = hasFeedConfig(env);
  let config;
  try {
    config = mssqlConfigFromEnv(env);
  } catch (err) {
    if (feedOk) {
      return { ok: true, source, latencyMs: elapsed() };
    }
    const code =
      err && typeof err === 'object' && err.code
        ? String(err.code)
        : 'awin_mssql_missing_config';
    return {
      ok: false,
      source,
      latencyMs: elapsed(),
      error: code,
    };
  }

  try {
    await probePartsReachable(config, deps);
    return { ok: true, source, latencyMs: elapsed() };
  } catch (err) {
    if (feedOk) {
      return { ok: true, source, latencyMs: elapsed() };
    }
    const msg =
      err && typeof err === 'object' && err.message
        ? String(err.message).slice(0, 200)
        : 'awin_mssql_unreachable';
    return {
      ok: false,
      source,
      latencyMs: elapsed(),
      error: msg || 'awin_mssql_unreachable',
    };
  }
}

/**
 * Orchestrator-facing probe(source) adapter (awin only).
 * @param {string} source
 * @param {object} [deps]
 */
async function awinSelftestProbe(source, deps) {
  if (source != null && String(source) !== 'awin') {
    return {
      ok: false,
      source: String(source),
      latencyMs: 0,
      error: 'wrong_source',
    };
  }
  return probeAwinSelftest(deps);
}

module.exports = {
  probeAwinSelftest,
  awinSelftestProbe,
  hasFeedConfig,
  probePartsReachable,
  PROBE_SQL,
  AwinMssqlConfigError,
};
