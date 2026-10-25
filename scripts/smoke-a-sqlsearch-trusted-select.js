'use strict';

/**
 * FR #4997: prove trusted SQL from beside a-sqlsearch.exe (or any execPath).
 *
 * Usage:
 *   node scripts/smoke-a-sqlsearch-trusted-select.js --exe dist/sea/a-sqlsearch.exe
 *
 * Requires MSSQL_TRUSTED_CONNECTION=true, MSSQL_SERVER, MSSQL_DATABASE, and
 * node_modules/msnodesqlv8 (+ mssql) beside the exe. SELECT 1 only. Never prints
 * secrets. Exit 0 on success; non-zero on failure. Skip (exit 0) when --allow-skip
 * and required env/exe layout is missing (CI without walrus SQL).
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  loadMssqlModule,
} = require('../shared/mssql/loadMssql');
const {
  mssqlConfigFromEnv,
  resolveMssqlRequirePath,
} = require('../providers/local/sql/src/queryParts');

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return '';
  return String(process.argv[i + 1] || '').trim();
}

function hasFlag(flag) {
  return process.argv.indexOf(flag) !== -1;
}

async function main() {
  const allowSkip = hasFlag('--allow-skip');
  const exeArg = argValue('--exe');
  const execPath = exeArg
    ? path.resolve(exeArg)
    : path.resolve(process.cwd(), 'dist', 'sea', 'a-sqlsearch.exe');

  const env = process.env;
  const trusted = String(env.MSSQL_TRUSTED_CONNECTION || '')
    .trim()
    .toLowerCase();
  const useTrusted =
    trusted === 'true' || trusted === '1' || trusted === 'yes';

  if (!useTrusted || !String(env.MSSQL_SERVER || '').trim() || !String(env.MSSQL_DATABASE || '').trim()) {
    if (allowSkip) {
      process.stdout.write(
        'smoke-a-sqlsearch-trusted-select: skip (need MSSQL_TRUSTED_CONNECTION + SERVER + DATABASE)\n',
      );
      return;
    }
    throw new Error(
      'missing_env: set MSSQL_TRUSTED_CONNECTION=true, MSSQL_SERVER, MSSQL_DATABASE',
    );
  }

  if (!fs.existsSync(execPath)) {
    if (allowSkip) {
      process.stdout.write(
        `smoke-a-sqlsearch-trusted-select: skip (exe missing: ${execPath})\n`,
      );
      return;
    }
    throw new Error(`exe_missing: ${execPath}`);
  }

  const cfg = mssqlConfigFromEnv(env);
  const mod = resolveMssqlRequirePath(cfg);
  if (mod !== 'mssql/msnodesqlv8') {
    throw new Error(`expected msnodesqlv8 path, got ${mod}`);
  }

  // Force beside-exe resolution (same path SEA uses).
  const sql = loadMssqlModule(mod, {
    execPath,
    forceBesideExe: true,
  });
  const pool = await sql.connect(cfg);
  try {
    const result = await pool.request().query('SELECT 1 AS ok');
    const ok =
      result &&
      result.recordset &&
      result.recordset[0] &&
      Number(result.recordset[0].ok) === 1;
    if (!ok) {
      throw new Error('select_failed: expected recordset[{ok:1}]');
    }
    process.stdout.write(
      `smoke-a-sqlsearch-trusted-select: ok exe=${path.basename(execPath)} database=${cfg.database}\n`,
    );
  } finally {
    if (pool && typeof pool.close === 'function') {
      await Promise.resolve(pool.close()).catch(() => {});
    }
  }
}

main().catch((err) => {
  const message = err && err.message ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
