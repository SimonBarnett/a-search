'use strict';

/**
 * Avantlink local Parts SELECT (FR-098).
 * Parameterized query against dbo.Parts; connection factory is injectable.
 * Stay-dark: registry enabled stays false.
 */

class AvantlinkMssqlConfigError extends Error {
  /**
   * @param {string} [message]
   */
  constructor(message) {
    super(message || 'MSSQL connection config missing for avantlink local worker');
    this.name = 'AvantlinkMssqlConfigError';
    this.code = 'avantlink_mssql_missing_config';
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
    throw new AvantlinkMssqlConfigError(
      'MSSQL_SERVER and MSSQL_DATABASE are required for avantlink queryParts',
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
      throw new AvantlinkMssqlConfigError(
        'MSSQL_USER is required unless MSSQL_TRUSTED_CONNECTION=true',
      );
    }
    cfg.user = user;
    cfg.password = password;
  }
  return cfg;
}

/**
 * Build search text from fan-out payload (`q` or `searchterms`).
 * @param {object} msg
 * @returns {string}
 */
function searchTextFromMsg(msg) {
  if (msg && typeof msg.q === 'string' && msg.q.trim() !== '') {
    return msg.q.trim();
  }
  if (msg && Array.isArray(msg.searchterms)) {
    return msg.searchterms
      .filter((t) => typeof t === 'string' && t.trim() !== '')
      .map((t) => t.trim())
      .join(' ');
  }
  if (msg && typeof msg.searchterms === 'string' && msg.searchterms.trim() !== '') {
    return msg.searchterms.trim();
  }
  return '';
}

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
WHERE Source = N'avantlink'
  AND Env = @env
  AND DeletedAt IS NULL
  AND (
    @q = N''
    OR Title LIKE @like
    OR Description LIKE @like
  )
`.trim();

/**
 * Default mssql connect (lazy require so tests can inject without the driver).
 * @param {object} config
 * @returns {Promise<{ request: Function, close?: Function }>}
 */
async function defaultConnect(config) {
  // eslint-disable-next-line global-require
  const sql = require('mssql');
  const pool = await sql.connect(config);
  return pool;
}

/**
 * @param {object} msg - SQS fan-out payload
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
    msg && msg.env != null ? String(msg.env).trim() : String(envVars.A_SEARCH_ENV || '');
  if (env !== 'live' && env !== 'sandbox') {
    throw new AvantlinkMssqlConfigError(
      `message.env must be live or sandbox (got ${JSON.stringify(msg && msg.env)})`,
    );
  }
  const q = searchTextFromMsg(msg || {});
  // Strip LIKE wildcards from user text; empty q skips LIKE via @q = N'' branch.
  const like = q === '' ? '%' : `%${q.replace(/[%_[\]]/g, '')}%`;
  const connect =
    deps && typeof deps.connect === 'function' ? deps.connect : defaultConnect;
  const pool = await connect(config);

  let sqlTypes = deps && deps.sqlTypes;
  if (!sqlTypes) {
    // eslint-disable-next-line global-require
    sqlTypes = require('mssql');
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
  AvantlinkMssqlConfigError,
  mssqlConfigFromEnv,
  searchTextFromMsg,
  SELECT_SQL,
  defaultQueryParts,
  defaultConnect,
};
