'use strict';

/**
 * FR #4447: sql local Parts SELECT (all sources) for walrus SQL drain.
 * SELECT only --- never INSERT/UPDATE/DELETE. Targets a_search / a_search_sandbox
 * on walrus; madeiradb must remain read-only if ever pointed here.
 */

class SqlMssqlConfigError extends Error {
  /**
   * @param {string} [message]
   */
  constructor(message) {
    super(message || 'MSSQL connection config missing for sql local worker');
    this.name = 'SqlMssqlConfigError';
    this.code = 'sql_mssql_missing_config';
  }
}

/**
 * FR #4534: trusted Windows auth must not use tedious NTLM (crashes in
 * ntlm-payload.js). Prefer msnodesqlv8 + ODBC trustedConnection.
 * @param {Record<string, string|undefined>|undefined} envVars
 * @returns {boolean}
 */
function isTrustedConnectionEnv(envVars) {
  const trusted = String((envVars || {}).MSSQL_TRUSTED_CONNECTION || '')
    .trim()
    .toLowerCase();
  return trusted === 'true' || trusted === '1' || trusted === 'yes';
}

/**
 * @param {object} config from mssqlConfigFromEnv
 * @returns {'mssql'|'mssql/msnodesqlv8'}
 */
function resolveMssqlRequirePath(config) {
  if (
    config &&
    (config.driver === 'msnodesqlv8' ||
      (config.options && config.options.trustedConnection === true))
  ) {
    return 'mssql/msnodesqlv8';
  }
  return 'mssql';
}

/**
 * @param {Record<string, string|undefined>} envVars
 * @returns {{
 *   server: string,
 *   database: string,
 *   driver?: string,
 *   user?: string,
 *   password?: string,
 *   options: { encrypt: boolean, trustServerCertificate: boolean, trustedConnection?: boolean },
 * }}
 */
function mssqlConfigFromEnv(envVars) {
  const server = String(envVars.MSSQL_SERVER || '').trim();
  const database = String(envVars.MSSQL_DATABASE || '').trim();
  if (!server || !database) {
    throw new SqlMssqlConfigError(
      'MSSQL_SERVER and MSSQL_DATABASE are required for sql queryParts',
    );
  }
  const useTrusted = isTrustedConnectionEnv(envVars);
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
    // FR #4534: ODBC trusted connection via msnodesqlv8 (not tedious NTLM).
    cfg.driver = 'msnodesqlv8';
    cfg.options.trustedConnection = true;
  } else {
    if (!user) {
      throw new SqlMssqlConfigError(
        'MSSQL_USER is required unless MSSQL_TRUSTED_CONNECTION=true',
      );
    }
    cfg.user = user;
    cfg.password = password;
  }
  return cfg;
}

/**
 * One query/exclude term: string or searches.json `{ q }` / `{ match }`.
 * @param {unknown} term
 * @returns {string}
 */
function termText(term) {
  if (typeof term === 'string') return term.trim();
  if (!term || typeof term !== 'object') return '';
  if (typeof term.q === 'string' && term.q.trim()) return term.q.trim();
  if (typeof term.match === 'string' && term.match.trim()) {
    const m = term.match.trim();
    const colon = m.indexOf(':');
    if (colon > 0 && colon < m.length - 1) return m.slice(colon + 1).trim();
    return m;
  }
  return '';
}

/**
 * Build search text from fan-out payload (`queries` / `exclude`, or legacy
 * `q` / `searchterms`). Agent `/search` sends searches.json-shaped `{ q }`
 * objects — string-only filters must not drop them (MRB #4455 / FR #4446 class).
 * @param {object} msg
 * @returns {string}
 */
function searchTextFromMsg(msg) {
  if (!msg || typeof msg !== 'object') return '';
  const parts = [];
  if (Array.isArray(msg.queries)) {
    for (const row of msg.queries) {
      const t = termText(row);
      if (t) parts.push(t);
    }
  }
  if (!parts.length && typeof msg.q === 'string' && msg.q.trim() !== '') {
    parts.push(msg.q.trim());
  }
  if (!parts.length && Array.isArray(msg.searchterms)) {
    for (const row of msg.searchterms) {
      const t = termText(row);
      if (t) parts.push(t);
    }
  }
  if (
    !parts.length &&
    typeof msg.searchterms === 'string' &&
    msg.searchterms.trim() !== ''
  ) {
    parts.push(msg.searchterms.trim());
  }
  if (!parts.length) return '';
  let q = parts.join(' ');
  if (Array.isArray(msg.exclude)) {
    for (const row of msg.exclude) {
      const t = termText(row);
      if (!t || t.length < 3) continue;
      if (/\s/.test(t)) q += ` -"${t.replace(/"/g, '')}"`;
      else q += ` -${t}`;
    }
  }
  return q.trim();
}

/**
 * Cross-source SELECT on a-search-owned dbo.Parts (FR-120).
 * No Source filter --- sql aggregates all ingested Parts for the env.
 */
const SELECT_SQL = `
SELECT
  Source,
  FeedKey,
  MerchantProductId,
  Env,
  Title,
  Description,
  Url,
  ImageUrl,
  Price,
  Currency,
  Stock
FROM dbo.Parts
WHERE Env = @env
  AND DeletedAt IS NULL
  AND (
    @q = N''
    OR Title LIKE @like
    OR Description LIKE @like
  )
`.trim();

/**
 * @param {object} config
 * @returns {Promise<{ request: Function, close?: Function }>}
 */
async function defaultConnect(config) {
  const mod = resolveMssqlRequirePath(config);
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const sql = require(mod);
  const pool = await sql.connect(config);
  return pool;
}

/**
 * @param {object} msg
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   connect?: (config: object) => Promise<{ request: Function, close?: Function }>,
 *   sqlTypes?: { NVarChar: unknown },
 * }} [deps]
 * @returns {Promise<object[]>}
 */
async function defaultQueryParts(msg, deps) {
  const envVars = (deps && deps.env) || process.env;
  const config = mssqlConfigFromEnv(envVars);
  const env =
    msg && msg.env != null
      ? String(msg.env).trim()
      : String(envVars.A_SEARCH_ENV || '');
  if (env !== 'live' && env !== 'sandbox') {
    throw new SqlMssqlConfigError(
      `message.env must be live or sandbox (got ${JSON.stringify(msg && msg.env)})`,
    );
  }
  const q = searchTextFromMsg(msg || {});
  const like = q === '' ? '%' : `%${q.replace(/[%_[\]]/g, '')}%`;
  const connect =
    deps && typeof deps.connect === 'function' ? deps.connect : defaultConnect;
  const pool = await connect(config);

  let sqlTypes = deps && deps.sqlTypes;
  if (!sqlTypes) {
    const mod = resolveMssqlRequirePath(config);
    // eslint-disable-next-line global-require, import/no-dynamic-require
    sqlTypes = require(mod);
  }

  try {
    const result = await pool
      .request()
      .input('env', sqlTypes.NVarChar, env)
      .input('q', sqlTypes.NVarChar, q)
      .input('like', sqlTypes.NVarChar, like)
      .query(SELECT_SQL);
    const rows = (result && result.recordset) || [];
    return Array.isArray(rows) ? rows : [];
  } finally {
    if (pool && typeof pool.close === 'function') {
      await Promise.resolve(pool.close()).catch(() => {});
    }
  }
}

module.exports = {
  SqlMssqlConfigError,
  mssqlConfigFromEnv,
  isTrustedConnectionEnv,
  resolveMssqlRequirePath,
  searchTextFromMsg,
  SELECT_SQL,
  defaultQueryParts,
  defaultConnect,
};
