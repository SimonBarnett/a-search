'use strict';

/**
 * FR-059k: Impact local selftest probe — MSSQL Parts reachable or config present.
 * Other providers are out of scope.
 */

const {
  ImpactMssqlConfigError,
  mssqlConfigFromEnv,
  defaultConnect,
} = require('./queryParts');
const { isMissingTableError } = require('../../../../shared/mssql/isMissingTableError');

/** FR-120: probe a-search-owned dbo.Parts. */
const PROBE_SQL = `
SELECT TOP (1) 1 AS ok
FROM dbo.Parts
WHERE Source = N'impact'
  AND DeletedAt IS NULL
`.trim();

/**
 * Affiliate / feed config readiness (IMPACT_CAMPAIGN_ID).
 * @param {Record<string, string|undefined>} env
 * @returns {boolean}
 */
function hasConfig(env) {
  const e = env || {};
  const campaign =
    e.IMPACT_CAMPAIGN_ID != null ? String(e.IMPACT_CAMPAIGN_ID).trim() : '';
  return Boolean(campaign);
}

/**
 * Lightweight Parts reachability check (injectable connect).
 * @param {object} config
 * @param {{ connect?: Function }} deps
 */
async function probePartsReachable(config, deps = {}) {
  const connect =
    deps && typeof deps.connect === 'function' ? deps.connect : defaultConnect;
  const pool = await connect(config);
  try {
    if (typeof pool.request !== 'function') {
      throw new Error('impact_mssql_bad_pool');
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
async function probeImpactSelftest(deps = {}) {
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const t0 = now();
  const source = 'impact';
  const env = deps.env || process.env;

  const elapsed = () => {
    const ms = now() - t0;
    return Number.isFinite(ms) && ms >= 0 ? ms : 0;
  };

  const configOk = hasConfig(env);
  let config;
  try {
    config = mssqlConfigFromEnv(env);
  } catch (err) {
    if (configOk) {
      return { ok: true, source, latencyMs: elapsed() };
    }
    const code =
      err && typeof err === 'object' && err.code
        ? String(err.code)
        : 'impact_mssql_missing_config';
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
    if (configOk) {
      return { ok: true, source, latencyMs: elapsed() };
    }
    if (isMissingTableError(err)) {
      return {
        ok: false,
        source,
        latencyMs: elapsed(),
        error: 'missing_table',
      };
    }
    const msg =
      err && typeof err === 'object' && err.message
        ? String(err.message).slice(0, 200)
        : 'mssql_unreachable';
    return {
      ok: false,
      source,
      latencyMs: elapsed(),
      error: msg || 'mssql_unreachable',
    };
  }
}

/**
 * Orchestrator-facing probe(source) adapter (impact only).
 * @param {string} source
 * @param {object} [deps]
 */
async function impactSelftestProbe(source, deps) {
  if (source != null && String(source) !== 'impact') {
    return {
      ok: false,
      source: String(source),
      latencyMs: 0,
      error: 'wrong_source',
    };
  }
  return probeImpactSelftest(deps);
}

module.exports = {
  isMissingTableError,
  probeImpactSelftest,
  impactSelftestProbe,
  hasConfig,
  probePartsReachable,
  PROBE_SQL,
  ImpactMssqlConfigError,
};
