'use strict';

/**
 * FR-242 selftest: Parts reachability or SQUARESPACE_ACCESS_TOKEN / API key present.
 */

const {
  classifyMssqlConnectError,
} = require('../../../../shared/mssql/classifyConnectError');
const {
  mssqlConfigFromEnv,
  SquarespaceMssqlConfigError,
} = require('./queryParts');

/**
 * @param {{ env?: object, connect?: Function }} [deps]
 */
async function selftestProbe(deps) {
  const envVars = (deps && deps.env) || process.env;
  const token = String(
    envVars.SQUARESPACE_ACCESS_TOKEN || envVars.SQUARESPACE_API_KEY || '',
  ).trim();
  if (token) {
    return { ok: true, mode: 'token_present' };
  }
  if (typeof (deps && deps.connect) !== 'function') {
    return { ok: false, mode: 'no_probe', reason: 'no_token_or_connect' };
  }
  try {
    const cfg = mssqlConfigFromEnv(envVars);
    const pool = await deps.connect(cfg);
    try {
      await pool.request().query('SELECT TOP 1 1 AS ok FROM dbo.Parts');
      return { ok: true, mode: 'parts_reachable' };
    } finally {
      if (pool && typeof pool.close === 'function') await pool.close();
    }
  } catch (err) {
    if (err instanceof SquarespaceMssqlConfigError) {
      return { ok: false, mode: 'mssql_config', reason: err.message };
    }
    return {
      ok: false,
      mode: 'mssql_error',
      reason: classifyMssqlConnectError(err),
    };
  }
}

module.exports = { selftestProbe };
