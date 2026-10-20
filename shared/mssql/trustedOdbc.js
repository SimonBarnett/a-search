'use strict';

/**
 * FR #4548: trusted msnodesqlv8 ODBC driver selection.
 * msnodesqlv8 defaults to "SQL Server Native Client 11.0", which is often
 * missing on modern Windows hosts (walrus has ODBC Driver 17 + "SQL Server").
 * Prefer MSSQL_ODBC_DRIVER (default ODBC Driver 17) or a full
 * MSSQL_CONNECTION_STRING override.
 */

/** @type {string} */
const DEFAULT_MSSQL_ODBC_DRIVER = 'ODBC Driver 17 for SQL Server';

/**
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} [env]
 * @returns {string}
 */
function mssqlOdbcDriverFromEnv(env = process.env) {
  const raw = String((env && env.MSSQL_ODBC_DRIVER) || '').trim();
  return raw || DEFAULT_MSSQL_ODBC_DRIVER;
}

/**
 * Optional full ODBC connection string override.
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} [env]
 * @returns {string|undefined}
 */
function mssqlConnectionStringFromEnv(env = process.env) {
  const raw = String((env && env.MSSQL_CONNECTION_STRING) || '').trim();
  return raw || undefined;
}

/**
 * Mutate a mssql config for trusted Windows auth via msnodesqlv8 + ODBC.
 * Sets driver, odbcDriver, connectionString, and options.trustedConnection.
 * @param {Record<string, any>} cfg  must already have server + database
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} [env]
 * @returns {Record<string, any>}
 */
function applyTrustedMssqlOdbc(cfg, env = process.env) {
  if (!cfg || typeof cfg !== 'object') {
    throw new TypeError('applyTrustedMssqlOdbc: cfg object required');
  }
  const override = mssqlConnectionStringFromEnv(env);
  const odbcDriver = mssqlOdbcDriverFromEnv(env);
  cfg.driver = 'msnodesqlv8';
  cfg.odbcDriver = odbcDriver;
  if (!cfg.options || typeof cfg.options !== 'object') {
    cfg.options = {};
  }
  cfg.options.trustedConnection = true;

  if (override) {
    cfg.connectionString = override;
    return cfg;
  }

  const server = String(cfg.server || '').trim();
  const database = String(cfg.database || '').trim();
  const parts = [
    `Driver={${odbcDriver}}`,
    `Server=${server}`,
    `Database=${database}`,
    'Trusted_Connection=yes',
  ];
  const opts = cfg.options;
  if (opts.encrypt === false) {
    parts.push('Encrypt=no');
  } else if (opts.encrypt === true) {
    parts.push('Encrypt=yes');
  }
  if (opts.trustServerCertificate === true) {
    parts.push('TrustServerCertificate=yes');
  }
  cfg.connectionString = parts.join(';');
  return cfg;
}

module.exports = {
  DEFAULT_MSSQL_ODBC_DRIVER,
  mssqlOdbcDriverFromEnv,
  mssqlConnectionStringFromEnv,
  applyTrustedMssqlOdbc,
};
