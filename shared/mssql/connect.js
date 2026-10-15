'use strict';

/**
 * FR-251 / #1365: shared MSSQL connector guard.
 * Writers never connect to madeiradb. Allowlist: a_search, a_search_sandbox.
 */

class MssqlConnectError extends Error {
  /**
   * @param {string} code
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message || code);
    this.name = 'MssqlConnectError';
    this.code = code;
  }
}

const DEFAULT_ALLOWLIST = ['a_search', 'a_search_sandbox'];

/**
 * @param {string} [raw]
 * @returns {string[]}
 */
function parseAllowlist(raw) {
  if (raw == null || String(raw).trim() === '') return DEFAULT_ALLOWLIST.slice();
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Assert DB_NAME() is an a-search owned database.
 * @param {string} dbName
 * @param {{ allowlist?: string[] }} [opts]
 */
function assertAsearchDatabase(dbName, opts = {}) {
  const name = String(dbName || '').trim();
  const allow = opts.allowlist || DEFAULT_ALLOWLIST;
  if (!allow.includes(name)) {
    throw new MssqlConnectError(
      'wrong_database',
      `MSSQL DB_NAME()=${name || '<empty>'} not in A_SEARCH_DB_ALLOWLIST`,
    );
  }
  return name;
}

/**
 * Open a connection via injectable factory, then assert DB_NAME().
 * @param {{
 *   connect: (config: object) => Promise<{ query: Function, close?: Function }>,
 *   config: object,
 *   allowlist?: string[],
 *   env?: NodeJS.ProcessEnv,
 * }} args
 */
async function connectAsearchMssql(args) {
  const env = args.env || process.env;
  const allowlist = args.allowlist || parseAllowlist(env.A_SEARCH_DB_ALLOWLIST);
  const configured = String(
    (args.config && args.config.database) || env.MSSQL_DATABASE || '',
  ).trim();
  if (configured) {
    assertAsearchDatabase(configured, { allowlist });
  }
  if (typeof args.connect !== 'function') {
    throw new MssqlConnectError('missing_connect', 'connect factory required');
  }
  const pool = await args.connect(args.config);
  const result = await pool.query('SELECT DB_NAME() AS name');
  const rows = Array.isArray(result)
    ? result
    : (result && result.recordset) || [];
  const dbName = rows[0] && (rows[0].name || rows[0].NAME);
  assertAsearchDatabase(dbName, { allowlist });
  return pool;
}

module.exports = {
  DEFAULT_ALLOWLIST,
  MssqlConnectError,
  parseAllowlist,
  assertAsearchDatabase,
  connectAsearchMssql,
};
