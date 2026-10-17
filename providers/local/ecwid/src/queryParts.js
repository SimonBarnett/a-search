'use strict';

class EcwidMssqlConfigError extends Error {
  constructor(message) {
    super(message || 'MSSQL connection config missing for Ecwid local worker');
    this.name = 'EcwidMssqlConfigError';
    this.code = 'ecwid_mssql_missing_config';
  }
}

function mssqlConfigFromEnv(envVars) {
  const server = String(envVars.MSSQL_SERVER || '').trim();
  const database = String(envVars.MSSQL_DATABASE || '').trim();
  if (!server || !database) {
    throw new EcwidMssqlConfigError(
      'MSSQL_SERVER and MSSQL_DATABASE are required for Ecwid queryParts',
    );
  }
  const trusted = String(envVars.MSSQL_TRUSTED_CONNECTION || '')
    .trim()
    .toLowerCase();
  const useTrusted = trusted === 'true' || trusted === '1' || trusted === 'yes';
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
      options: { domain: envVars.MSSQL_DOMAIN || '' },
    };
  } else {
    cfg.user = String(envVars.MSSQL_USER || '').trim();
    cfg.password =
      envVars.MSSQL_PASSWORD == null ? '' : String(envVars.MSSQL_PASSWORD);
  }
  return cfg;
}

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
      .input('Source', 'ecwid')
      .input('Env', env)
      .query(
        "SELECT * FROM dbo.Parts WHERE Source = @Source AND Env = @Env AND (DeletedAt IS NULL OR DeletedAt = '')",
      );
    return (result && result.recordset) || [];
  } finally {
    if (pool && typeof pool.close === 'function') await pool.close();
  }
}

module.exports = {
  EcwidMssqlConfigError,
  mssqlConfigFromEnv,
  defaultQueryParts,
};
