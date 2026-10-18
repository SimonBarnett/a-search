'use strict';

/**
 * FR-3951: madeiradb is read-only; writers only a_search / a_search_sandbox.
 */

const WRITE_DATABASES = new Set(['a_search', 'a_search_sandbox']);

class DbWriterGuardError extends Error {
  /**
   * @param {string} code
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message || code);
    this.name = 'DbWriterGuardError';
    this.code = code;
  }
}

/**
 * @param {string|undefined|null} database
 * @returns {string} normalised database name
 */
function assertWritableDatabase(database) {
  const name = database == null ? '' : String(database).trim().toLowerCase();
  if (!name) {
    throw new DbWriterGuardError('empty_database');
  }
  if (name === 'madeiradb') {
    throw new DbWriterGuardError('madeiradb_read_only');
  }
  if (!WRITE_DATABASES.has(name)) {
    throw new DbWriterGuardError(
      'db_writer_not_allowed',
      `db_writer_not_allowed:${name}`,
    );
  }
  return name;
}

/**
 * @param {Record<string, string|undefined>|undefined} envVars
 * @returns {string}
 */
function assertWritableDatabaseFromEnv(envVars) {
  const env = envVars || process.env;
  return assertWritableDatabase(env.MSSQL_DATABASE);
}

module.exports = {
  WRITE_DATABASES,
  DbWriterGuardError,
  assertWritableDatabase,
  assertWritableDatabaseFromEnv,
};
