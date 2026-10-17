'use strict';

const {
  classifyMssqlConnectError,
} = require('../../../../shared/mssql/classifyConnectError');
const {
  mssqlConfigFromEnv,
  BigCommerceMssqlConfigError,
} = require('./queryParts');

async function selftestProbe(deps) {
  const envVars = (deps && deps.env) || process.env;
  if (
    String(envVars.BIGCOMMERCE_CLIENT_ID || '').trim() ||
    String(envVars.BIGCOMMERCE_ACCESS_TOKEN || '').trim()
  ) {
    return { ok: true, mode: 'app_or_token_present' };
  }
  if (typeof (deps && deps.connect) !== 'function') {
    return { ok: false, mode: 'no_probe', reason: 'no_creds_or_connect' };
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
    if (err instanceof BigCommerceMssqlConfigError) {
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
