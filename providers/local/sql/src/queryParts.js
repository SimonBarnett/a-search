'use strict';

/**
 * FR #4447: sql local Parts SELECT (all sources) for walrus SQL drain.
 * SELECT only --- never INSERT/UPDATE/DELETE. Targets a_search / a_search_sandbox
 * on walrus; madeiradb must remain read-only if ever pointed here.
 */

const { applyTrustedMssqlOdbc } = require('../../../../shared/mssql/trustedOdbc');
const {
  loadMssqlModule: loadMssqlFromDisk,
} = require('../../../../shared/mssql/loadMssql');

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
    // FR #4534 / #4548: msnodesqlv8 + ODBC Driver 17 (not Native Client 11.0 / NTLM).
    applyTrustedMssqlOdbc(cfg, envVars);
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
 * Include terms from fan-out (`queries`, or legacy `q` / `searchterms`).
 * @param {object} msg
 * @returns {string[]}
 */
function includeTermsFromMsg(msg) {
  if (!msg || typeof msg !== 'object') return [];
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
  return parts;
}

/**
 * Exclude terms (AND NOT). Skip shorter than 3 chars (same as LIKE path).
 * @param {object} msg
 * @returns {string[]}
 */
function excludeTermsFromMsg(msg) {
  if (!msg || typeof msg !== 'object' || !Array.isArray(msg.exclude)) return [];
  const out = [];
  for (const row of msg.exclude) {
    const t = termText(row);
    if (!t || t.length < 3) continue;
    out.push(t);
  }
  return out;
}

/**
 * Build search text from fan-out payload (`queries` / `exclude`, or legacy
 * `q` / `searchterms`). Agent `/search` sends searches.json-shaped `{ q }`
 * objects — string-only filters must not drop them (MRB #4455 / FR #4446 class).
 * @param {object} msg
 * @returns {string}
 */
function searchTextFromMsg(msg) {
  const parts = includeTermsFromMsg(msg);
  if (!parts.length) return '';
  let q = parts.join(' ');
  for (const t of excludeTermsFromMsg(msg)) {
    if (/\s/.test(t)) q += ` -"${t.replace(/"/g, '')}"`;
    else q += ` -${t}`;
  }
  return q.trim();
}

/**
 * SQL Server English system stoplist (noise). Tokens matching these are
 * dropped so CONTAINS does not raise noise-word informational errors (FR #5004).
 */
const ENGLISH_FT_NOISE_WORDS = new Set(
  (
    'a an and are as at be but by for from had has have he her here him his ' +
    'how i if in into is it its me my no not of on or our out she so that the ' +
    'their them then there these they this to too up us was we were what when ' +
    'where which who will with would you your about after all also another any ' +
    'because been before being between both came can come could did do each get ' +
    'got here himself like make many might more most much must never now only ' +
    'other over said same see should since some still such take than their ' +
    'through under very way well what while'
  ).split(/\s+/),
);

const CONTAINS_OPERATORS = new Set([
  'and',
  'or',
  'not',
  'near',
  'formsof',
  'inflectional',
  'thesaurus',
  'isabout',
  'weight',
  'true',
  'false',
]);

/**
 * Split raw query text into CONTAINS word tokens: strip punctuation and
 * operators, drop English noise words. Never concatenated into SQL text.
 * @param {string} raw
 * @returns {string[]}
 */
function sanitizeContainsTokens(raw) {
  const cleaned = String(raw || '')
    .replace(/"/g, ' ')
    .replace(/[^A-Za-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return [];
  const out = [];
  for (const part of cleaned.split(' ')) {
    const token = part.replace(/^\.+|\.+$/g, '');
    if (!token || token.length < 2) continue;
    const lower = token.toLowerCase();
    if (CONTAINS_OPERATORS.has(lower) || ENGLISH_FT_NOISE_WORDS.has(lower)) {
      continue;
    }
    out.push(token);
  }
  return out;
}

/**
 * Quote sanitised tokens for one include/exclude query (AND within the query).
 * @param {string} raw
 * @returns {string}
 */
function quoteContainsTerm(raw) {
  const tokens = sanitizeContainsTokens(raw);
  if (!tokens.length) return '';
  return tokens.map((t) => `"${t}"`).join(' AND ');
}

/**
 * @param {unknown} err
 * @returns {object[]}
 */
function collectSqlErrorInfos(err) {
  const infos = [];
  const seen = new Set();
  function walk(node) {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (node.info && typeof node.info === 'object') infos.push(node.info);
    if (Array.isArray(node.precedingErrors)) {
      for (const p of node.precedingErrors) walk(p);
    }
    if (node.originalError) walk(node.originalError);
  }
  walk(err);
  return infos;
}

/**
 * Severity < 11 (informational) including noise-word notices.
 * @param {unknown} err
 * @returns {boolean}
 */
function isInformationalSqlError(err) {
  const infos = collectSqlErrorInfos(err);
  if (infos.length) {
    return infos.every((info) => {
      const sev = Number(info.class != null ? info.class : info.severity);
      return Number.isFinite(sev) && sev < 11;
    });
  }
  const message = String((err && err.message) || err || '');
  return /noise word/i.test(message);
}

/**
 * Log line / Error for a real SQL failure (never bare EREQUEST).
 * @param {unknown} err
 * @param {string} contains
 * @returns {Error}
 */
function firstSqlNumber(err) {
  const infos = collectSqlErrorInfos(err);
  for (const info of infos) {
    if (info && info.number != null && info.number !== '') return info.number;
  }
  let node = err;
  for (let i = 0; i < 8 && node && typeof node === 'object'; i += 1) {
    if (node.sqlNumber != null && node.sqlNumber !== '') return node.sqlNumber;
    if (node.number != null && node.number !== '') return node.number;
    node = node.originalError;
  }
  return '';
}

function formatSqlQueryError(err, contains) {
  if (err && err.code === 'sql_query_failed' && err.message) {
    return String(err.message);
  }
  const infos = collectSqlErrorInfos(err);
  const info = infos[0] || {};
  const number = firstSqlNumber(err);
  const message = String(
    info.message ||
      (err && err.sqlMessage) ||
      (err && err.message) ||
      err ||
      'sql_error',
  ).replace(/\s+/g, ' ').trim();
  const containsSafe = String(contains || '').slice(0, 500);
  const line = `sql_query_failed number=${number === '' ? '?' : number} message=${message} contains=${containsSafe}`;
  const out = new Error(line);
  out.code = 'sql_query_failed';
  out.sqlNumber = number === '' ? undefined : number;
  out.sqlMessage = message;
  out.containsQuery = containsSafe;
  return out;
}

/**
 * FR #4976: CONTAINS predicate --- each include OR, each exclude AND NOT.
 * @param {object} msg
 * @returns {string} empty when there are no include terms
 */
function buildContainsQuery(msg) {
  const includes = includeTermsFromMsg(msg)
    .map(quoteContainsTerm)
    .filter(Boolean);
  if (!includes.length) return '';
  let q = includes.join(' OR ');
  for (const t of excludeTermsFromMsg(msg)) {
    const quoted = quoteContainsTerm(t);
    if (quoted) q += ` AND NOT ${quoted}`;
  }
  return q;
}

/**
 * FR #4976: TOP limit from env/config. Default 500. Not hard-coded in SQL.
 * @param {Record<string, string|undefined>|undefined} envVars
 * @returns {number}
 */
function sqlTopLimit(envVars) {
  const raw = envVars && envVars.A_SEARCH_SQL_TOP;
  const n = parseInt(String(raw == null ? '' : raw).trim(), 10);
  if (!Number.isFinite(n) || n < 1) return 500;
  return Math.min(n, 10000);
}

/**
 * Cross-source SELECT on a-search-owned dbo.Parts (FR-120 / FR #4976).
 * Full-text CONTAINSTABLE on Title/Description; TOP (@n) by rank.
 * No Source filter --- sql aggregates all ingested Parts for the env.
 */
const SELECT_SQL = `
SELECT TOP (@n)
  p.Source,
  p.FeedKey,
  p.MerchantProductId,
  p.Env,
  p.Title,
  p.Description,
  p.Url,
  p.ImageUrl,
  p.Price,
  p.Currency,
  p.Stock
FROM CONTAINSTABLE(dbo.Parts, (Title, Description), @contains) AS ft
INNER JOIN dbo.Parts AS p ON p.PartId = ft.[KEY]
WHERE p.Env = @env
  AND p.DeletedAt IS NULL
ORDER BY ft.[RANK] DESC
`.trim();

/**
 * @param {object} config
 * @returns {Promise<{ request: Function, close?: Function }>}
 */
/**
 * Static mssql require stays for SEA esbuild bundling; msnodesqlv8 loads from
 * disk beside the exe via createRequire(process.execPath) when running as SEA
 * (FR #4997). Plain require('mssql/msnodesqlv8') fails inside SEA with
 * ERR_UNKNOWN_BUILTIN_MODULE even when node_modules sits beside the exe.
 * @param {object} config
 * @param {Parameters<typeof loadMssqlFromDisk>[1]} [loadOpts]
 */
function loadMssqlModule(config, loadOpts) {
  const mod = resolveMssqlRequirePath(config);
  return loadMssqlFromDisk(mod, loadOpts);
}

async function defaultConnect(config) {
  const sql = loadMssqlModule(config);
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
  const env =
    msg && msg.env != null
      ? String(msg.env).trim()
      : String(envVars.A_SEARCH_ENV || '');
  if (env !== 'live' && env !== 'sandbox') {
    throw new SqlMssqlConfigError(
      `message.env must be live or sandbox (got ${JSON.stringify(msg && msg.env)})`,
    );
  }
  const contains = buildContainsQuery(msg || {});
  if (!contains) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[a-search]', 'WARN', 'sql_empty_queries_no_select');
    }
    return [];
  }
  const config = mssqlConfigFromEnv(envVars);
  const topN = sqlTopLimit(envVars);
  const connect =
    deps && typeof deps.connect === 'function' ? deps.connect : defaultConnect;
  const pool = await connect(config);

  let sqlTypes = deps && deps.sqlTypes;
  if (!sqlTypes) {
    sqlTypes = loadMssqlModule(config);
  }

  try {
    try {
      const result = await pool
        .request()
        .input('env', sqlTypes.NVarChar, env)
        .input('contains', sqlTypes.NVarChar, contains)
        .input('n', sqlTypes.Int, topN)
        .query(SELECT_SQL);
      const rows = (result && result.recordset) || [];
      return Array.isArray(rows) ? rows : [];
    } catch (err) {
      if (isInformationalSqlError(err)) {
        return [];
      }
      throw formatSqlQueryError(err, contains);
    }
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
  loadMssqlModule,
  searchTextFromMsg,
  includeTermsFromMsg,
  excludeTermsFromMsg,
  quoteContainsTerm,
  sanitizeContainsTokens,
  buildContainsQuery,
  sqlTopLimit,
  SELECT_SQL,
  defaultQueryParts,
  defaultConnect,
  isInformationalSqlError,
  formatSqlQueryError,
  ENGLISH_FT_NOISE_WORDS,
};
