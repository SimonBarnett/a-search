'use strict';

const {
  classifyMssqlConnectError,
} = require('../../../../shared/mssql/classifyConnectError');
const {
  mssqlConfigFromEnv,
  MagentoMssqlConfigError,
} = require('./queryParts');

async function selftestProbe(deps) {
  const envVars = (deps && deps.env) || process.env;
  if (String(envVars.MAGENTO_STORE_BASE_URL || '').trim()) {
    return { ok: true, mode: 'store_url_present' };
  }
  if (typeof (deps && deps.connect) !== 'function') {
    return { ok: false, mode: 'no_probe', reason: 'no_url_or_connect' };
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
    if (err instanceof MagentoMssqlConfigError) {
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
