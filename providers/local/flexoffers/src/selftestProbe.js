'use strict';

const { classifyMssqlConnectError } = require('../../../../shared/mssql/classifyConnectError');

/**
 * FR-096: Flexoffers local selftest probe -- MSSQL Parts reachable or API
 * token present. Stay-dark: registry enabled stays false.
 * Other providers are out of scope.
 *
 * Injectable `connect` keeps unit tests offline (no live network / live SQL).
 */

class FlexoffersMssqlConfigError extends Error {
  /**
   * @param {string} [message]
   */
  constructor(message) {
    super(
      message || 'MSSQL connection config missing for flexoffers selftest',
    );
    this.name = 'FlexoffersMssqlConfigError';
    this.code = 'flexoffers_mssql_missing_config';
  }
}

/**
 * @param {Record<string, string|undefined>} envVars
 * @returns {{
 *   server: string,
 *   database: string,
 *   user?: string,
 *   password?: string,
 *   options: { encrypt: boolean, trustServerCertificate: boolean },
 *   authentication?: { type: string, options: object },
 * }}
 */
function mssqlConfigFromEnv(envVars) {
  const server = String(envVars.MSSQL_SERVER || '').trim();
  const database = String(envVars.MSSQL_DATABASE || '').trim();
  if (!server || !database) {
    throw new FlexoffersMssqlConfigError(
      'MSSQL_SERVER and MSSQL_DATABASE are required for flexoffers selftest',
    );
  }
  const trusted = String(envVars.MSSQL_TRUSTED_CONNECTION || '')
    .trim()
    .toLowerCase();
  const useTrusted = trusted === 'true' || trusted === '1' || trusted === 'yes';
  const user = String(envVars.MSSQL_USER || '').trim();
  const password =
    envVars.MSSQL_PASSWORD == null ? '' : String(envVars.MSSQL_PASSWORD);

  /** @type {any} */
  const cfg = {
    server,
    database,
    options: {
      encrypt: String(envVars.MSSQL_ENCRYPT || 'true').toLowerCase() !== 'false',
      trustServerCertificate:
        String(envVars.MSSQL_TRUST_SERVER_CERTIFICATE || 'true').toLowerCase() !==
        'false',
    },
  };

  if (useTrusted) {
    cfg.authentication = {
      type: 'ntlm',
      options: {
        domain: String(envVars.MSSQL_DOMAIN || '').trim(),
        userName: user || undefined,
        password: password || undefined,
      },
    };
  } else {
    if (!user) {
      throw new FlexoffersMssqlConfigError(
        'MSSQL_USER is required unless MSSQL_TRUSTED_CONNECTION=true',
      );
    }
    cfg.user = user;
    cfg.password = password;
  }
  return cfg;
}

/**
 * @param {object} config
 * @returns {Promise<{ request: Function, close?: Function }>}
 */
async function defaultConnect(config) {
  // eslint-disable-next-line global-require
  const sql = require('mssql');
  const pool = await sql.connect(config);
  return pool;
}

const PROBE_SQL = `
SELECT TOP (1) 1 AS ok
FROM dbo.Parts
WHERE Source = N'flexoffers'
  AND DeletedAt IS NULL
`.trim();

/**
 * API token readiness (placeholder until account details exist).
 * @param {Record<string, string|undefined>} env
 * @returns {boolean}
 */
function hasFeedConfig(env) {
  const e = env || {};
  const token =
    e.FLEXOFFERS_API_TOKEN != null ? String(e.FLEXOFFERS_API_TOKEN).trim() : '';
  return Boolean(token);
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
      throw new Error('flexoffers_mssql_bad_pool');
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
async function probeFlexoffersSelftest(deps = {}) {
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const t0 = now();
  const source = 'flexoffers';
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
        : 'flexoffers_mssql_missing_config';
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
    return {
      ok: false,
      source,
      latencyMs: elapsed(),
      error: classifyMssqlConnectError(err),
    };
  }
}

/**
 * Orchestrator-facing probe(source) adapter (flexoffers only).
 * @param {string} source
 * @param {object} [deps]
 */
async function flexoffersSelftestProbe(source, deps) {
  if (source != null && String(source) !== 'flexoffers') {
    return {
      ok: false,
      source: String(source),
      latencyMs: 0,
      error: 'wrong_source',
    };
  }
  return probeFlexoffersSelftest(deps);
}

module.exports = {
  probeFlexoffersSelftest,
  flexoffersSelftestProbe,
  hasFeedConfig,
  probePartsReachable,
  mssqlConfigFromEnv,
  defaultConnect,
  PROBE_SQL,
  FlexoffersMssqlConfigError,
};
