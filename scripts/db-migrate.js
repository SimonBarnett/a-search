'use strict';

/**
 * FR-251 / #1365 / FR #4521: apply db/migrations/*.sql to a_search / a_search_sandbox only.
 * Refuses madeiradb. Uses migrator secret (never Lambda app login).
 *
 * Usage (ops): node scripts/db-migrate.js
 * Env: MSSQL_DATABASE must be a_search or a_search_sandbox; plus MSSQL_SERVER and auth.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  assertAsearchDatabase,
  MssqlConnectError,
  DEFAULT_ALLOWLIST,
  connectAsearchMssql,
} = require('../shared/mssql/connect');

const ROOT = path.join(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'db', 'migrations');

/**
 * @param {string} filePath
 * @returns {string}
 */
function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Split T-SQL on standalone GO batch separators (line with optional whitespace).
 * Does not attempt full string/comment parsing beyond whole-line GO.
 * @param {string} sql
 * @returns {string[]}
 */
function splitGoBatches(sql) {
  const lines = String(sql || '').split(/\r?\n/);
  /** @type {string[]} */
  const batches = [];
  /** @type {string[]} */
  let current = [];
  for (const line of lines) {
    if (/^\s*GO\s*(?:--.*)?$/i.test(line)) {
      const batch = current.join('\n').trim();
      if (batch) batches.push(batch);
      current = [];
      continue;
    }
    current.push(line);
  }
  const tail = current.join('\n').trim();
  if (tail) batches.push(tail);
  return batches;
}

/**
 * List pending *.sql migrations sorted by filename (exclude README).
 * @param {string} [dir]
 */
function listMigrationFiles(dir = MIGRATIONS_DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}_.+\.sql$/i.test(f))
    .sort()
    .map((f) => path.join(dir, f));
}

/**
 * @param {string} sql
 * @param {string} fileName
 */
function assertTargetHeader(sql, fileName) {
  const first = String(sql)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!first || !/^--\s*target:\s*a_search\b/i.test(first)) {
    throw new Error(
      `${fileName}: first non-empty line must be '-- target: a_search'`,
    );
  }
}

/**
 * Apply pending migrations with an injectable connection.
 * @param {{
 *   query: (sql: string, params?: object) => Promise<object>,
 *   database: string,
 *   applied?: Map<string, string>|Set<string>,
 *   listFiles?: () => string[],
 *   readFile?: (filePath: string) => string,
 *   sha256Of?: (filePath: string) => string,
 * }} deps
 */
async function runMigrations(deps) {
  const database = assertAsearchDatabase(deps.database, {
    allowlist: DEFAULT_ALLOWLIST,
  });
  if (/madeiradb/i.test(database)) {
    throw new MssqlConnectError(
      'wrong_database',
      'db-migrate refuses madeiradb',
    );
  }

  /** @type {Map<string, string>} */
  let appliedMap;
  if (deps.applied instanceof Map) {
    appliedMap = deps.applied;
  } else if (deps.applied instanceof Set) {
    appliedMap = new Map();
    for (const name of deps.applied) appliedMap.set(name, '');
  } else {
    appliedMap = new Map();
  }

  const listFiles =
    typeof deps.listFiles === 'function'
      ? deps.listFiles
      : () => listMigrationFiles();
  const readFile =
    typeof deps.readFile === 'function'
      ? deps.readFile
      : (filePath) => fs.readFileSync(filePath, 'utf8');
  const sha256Of =
    typeof deps.sha256Of === 'function' ? deps.sha256Of : sha256File;

  const files = listFiles();
  /** @type {string[]} */
  const ran = [];
  /** @type {string[]} */
  const skipped = [];

  for (const filePath of files) {
    const name = path.basename(filePath);
    const sql = readFile(filePath);
    assertTargetHeader(sql, name);
    const hash = sha256Of(filePath);

    if (appliedMap.has(name)) {
      const recorded = String(appliedMap.get(name) || '');
      if (recorded && recorded !== hash) {
        throw new Error(
          `${name}: SchemaMigrations Sha256 checksum mismatch (recorded=${recorded} file=${hash})`,
        );
      }
      // Empty recorded hash (legacy Set inject) still skips by name.
      skipped.push(name);
      continue;
    }

    const batches = splitGoBatches(sql);
    try {
      for (const batch of batches) {
        await deps.query(batch);
      }
    } catch (err) {
      const message = err && err.message ? String(err.message) : String(err);
      const wrapped = new Error(`${name}: ${message}`);
      wrapped.cause = err;
      throw wrapped;
    }

    await deps.query(
      `INSERT INTO dbo.SchemaMigrations (Name, Sha256, AppliedAt) VALUES (@name, @sha, SYSUTCDATETIME())`,
      { name, sha: hash },
    );
    appliedMap.set(name, hash);
    ran.push(name);
  }
  return { database, ran, skipped };
}

/**
 * Build mssql config from env (migrator / ops login).
 * @param {NodeJS.ProcessEnv} [env]
 */
function migratorConfigFromEnv(env = process.env) {
  const server = String(env.MSSQL_SERVER || '').trim();
  const database = String(env.MSSQL_DATABASE || '').trim();
  if (!server || !database) {
    throw new MssqlConnectError(
      'missing_config',
      'MSSQL_SERVER and MSSQL_DATABASE are required for db-migrate',
    );
  }
  assertAsearchDatabase(database);
  const trusted = /^(1|true|yes)$/i.test(
    String(env.MSSQL_TRUSTED_CONNECTION || '').trim(),
  );
  /** @type {Record<string, unknown>} */
  const config = {
    server,
    database,
    options: {
      encrypt: /^(1|true|yes)$/i.test(String(env.MSSQL_ENCRYPT || 'false')),
      trustServerCertificate: /^(1|true|yes)$/i.test(
        String(env.MSSQL_TRUST_SERVER_CERTIFICATE || 'true'),
      ),
      enableArithAbort: true,
    },
  };
  if (trusted) {
    config.options = {
      .../** @type {object} */ (config.options),
      trustedConnection: true,
    };
  } else {
    const user = String(env.MSSQL_USER || '').trim();
    const password = String(env.MSSQL_PASSWORD || '');
    if (!user) {
      throw new MssqlConnectError(
        'missing_config',
        'MSSQL_USER + MSSQL_PASSWORD (or MSSQL_TRUSTED_CONNECTION=true) required',
      );
    }
    config.user = user;
    config.password = password;
  }
  return config;
}

/**
 * Load Name -> Sha256 from dbo.SchemaMigrations (empty if table missing).
 * @param {(sql: string, params?: object) => Promise<object>} query
 */
async function loadAppliedMigrations(query) {
  /** @type {Map<string, string>} */
  const map = new Map();
  try {
    const result = await query(
      'SELECT Name, Sha256 FROM dbo.SchemaMigrations',
    );
    const rows = Array.isArray(result)
      ? result
      : (result && result.recordset) || [];
    for (const row of rows) {
      const name = String((row && (row.Name || row.name)) || '').trim();
      const sha = String((row && (row.Sha256 || row.sha256)) || '')
        .trim()
        .toLowerCase();
      if (name) map.set(name, sha);
    }
  } catch (err) {
    const message = err && err.message ? String(err.message) : String(err);
    if (/Invalid object name.*SchemaMigrations/i.test(message)) {
      return map;
    }
    throw err;
  }
  return map;
}

/**
 * @param {import('mssql').ConnectionPool} pool
 * @param {typeof import('mssql')} sql
 */
function makePoolQuery(pool, sql) {
  return async function query(text, params) {
    const request = pool.request();
    if (params && typeof params === 'object') {
      for (const [key, value] of Object.entries(params)) {
        request.input(key, sql.NVarChar, value == null ? null : String(value));
      }
    }
    return request.query(text);
  };
}

async function main() {
  const database = String(process.env.MSSQL_DATABASE || '').trim();
  assertAsearchDatabase(database);
  // eslint-disable-next-line global-require
  const sql = require('mssql');
  const config = migratorConfigFromEnv(process.env);
  const pool = await connectAsearchMssql({
    connect: (cfg) => sql.connect(cfg),
    config,
  });
  try {
    const query = makePoolQuery(pool, sql);
    const applied = await loadAppliedMigrations(query);
    const result = await runMigrations({
      database,
      query,
      applied,
    });
    console.log(
      JSON.stringify({
        ok: true,
        database: result.database,
        ran: result.ran,
        skipped: result.skipped,
      }),
    );
  } finally {
    if (pool && typeof pool.close === 'function') {
      await Promise.resolve(pool.close()).catch(() => {});
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exitCode = 1;
  });
}

module.exports = {
  listMigrationFiles,
  assertTargetHeader,
  runMigrations,
  sha256File,
  splitGoBatches,
  migratorConfigFromEnv,
  loadAppliedMigrations,
  MIGRATIONS_DIR,
};
