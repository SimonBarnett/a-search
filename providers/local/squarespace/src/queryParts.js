'use strict';

/**
 * Squarespace local Parts SELECT. Parameterized; connection injectable.
 */

class SquarespaceMssqlConfigError extends Error {
  constructor(message) {
    super(
      message || 'MSSQL connection config missing for Squarespace local worker',
    );
    this.name = 'SquarespaceMssqlConfigError';
    this.code = 'squarespace_mssql_missing_config';
  }
}

function mssqlConfigFromEnv(envVars) {
  const server = String(envVars.MSSQL_SERVER || '').trim();
  const database = String(envVars.MSSQL_DATABASE || '').trim();
  if (!server || !database) {
    throw new SquarespaceMssqlConfigError(
      'MSSQL_SERVER and MSSQL_DATABASE are required for Squarespace queryParts',
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
    cfg.authentication = { type: 'ntlm', options: { domain: envVars.MSSQL_DOMAIN || '' } };
  } else {
    cfg.user = user;
    cfg.password = password;
  }
  return cfg;
}

/**
 * @param {object} msg
 * @param {{ connect?: Function, env?: object }} [deps]
 */
async function defaultQueryParts(msg, deps) {
  const envVars = (deps && deps.env) || process.env;
  const connect = deps && deps.connect;
  if (typeof connect !== 'function') {
    throw new Error('queryParts: connect factory required');
  }
  const cfg = mssqlConfigFromEnv(envVars);
  const pool = await connect(cfg);
  try {
    const env = String((msg && msg.env) || envVars.A_SEARCH_ENV || 'sandbox');
    const result = await pool
      .request()
      .input('Source', 'squarespace')
      .input('Env', env)
      .query(
        'SELECT * FROM dbo.Parts WHERE Source = @Source AND Env = @Env AND (DeletedAt IS NULL OR DeletedAt = \'\')',
      );
    return (result && result.recordset) || [];
  } finally {
    if (pool && typeof pool.close === 'function') await pool.close();
  }
}

module.exports = {
  SquarespaceMssqlConfigError,
  mssqlConfigFromEnv,
  defaultQueryParts,
};
