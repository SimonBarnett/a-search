'use strict';

/**
 * FR-251 / #1365: apply db/migrations/*.sql to a_search / a_search_sandbox only.
 * Refuses madeiradb. Uses migrator secret (never Lambda app login).
 *
 * Usage (ops): node scripts/db-migrate.js
 * Env: MSSQL_DATABASE must be a_search or a_search_sandbox.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  assertAsearchDatabase,
  MssqlConnectError,
  DEFAULT_ALLOWLIST,
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
 *   applied?: Set<string>,
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
  const applied = deps.applied || new Set();
  const files = listMigrationFiles();
  /** @type {string[]} */
  const ran = [];
  for (const filePath of files) {
    const name = path.basename(filePath);
    if (applied.has(name)) continue;
    const sql = fs.readFileSync(filePath, 'utf8');
    assertTargetHeader(sql, name);
    const hash = sha256File(filePath);
    await deps.query(sql);
    await deps.query(
      `INSERT INTO dbo.SchemaMigrations (Name, Sha256, AppliedAt) VALUES (@name, @sha, SYSUTCDATETIME())`,
      { name, sha: hash },
    );
    applied.add(name);
    ran.push(name);
  }
  return { database, ran };
}

async function main() {
  const database = String(process.env.MSSQL_DATABASE || '').trim();
  assertAsearchDatabase(database);
  // Live wiring uses migrator tooling outside Lambda; this CLI stub documents the gate.
  console.log(
    JSON.stringify({
      ok: true,
      database,
      pending: listMigrationFiles().map((f) => path.basename(f)),
      note: 'Wire mssql migrator driver in ops; unit tests cover refuse-madeiradb gate',
    }),
  );
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
  MIGRATIONS_DIR,
};
