#!/usr/bin/env node
'use strict';

/**
 * FR #4463 / #4520 / #4943: walrus daily import CLI
 * node walrus/import/cli.js run [--provider X] [--feed Y] [--dry-run]
 *
 * Production uses mssql store (ingest.* + MERGE dbo.Parts) unless IMPORT_MEMORY=1.
 * FR #4943: every failed load opens/comments a GitHub issue on a-search (or outbox).
 */

const path = require('node:path');
const os = require('node:os');
const { createMemoryStore } = require('./src/memoryStore');
const { createSqlStore } = require('./src/sqlStore');
const { runDailyImport } = require('./src/runImport');
const {
  reportImportFailure,
  flushFailureOutbox,
} = require('./src/reportImportFailure');
const { redactSecrets } = require('./src/mapRow');

function parseArgs(argv) {
  const out = { cmd: 'run', dryRun: false, provider: null, feed: null, config: null };
  const args = argv.slice(2);
  if (args[0] && !args[0].startsWith('-')) {
    out.cmd = args.shift();
  }
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--provider') out.provider = args[++i];
    else if (a === '--feed') out.feed = args[++i];
    else if (a === '--config') out.config = args[++i];
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

/**
 * FR #4943: refuse silent sandbox default for scheduled runs.
 * IMPORT_ALLOW_DEFAULT_DB=1 keeps unit/dev convenience.
 */
function resolveDatabase(env) {
  const e = env || process.env;
  const raw = e.MSSQL_DATABASE != null ? String(e.MSSQL_DATABASE).trim() : '';
  if (raw) return { ok: true, database: raw.toLowerCase() };
  if (e.IMPORT_ALLOW_DEFAULT_DB === '1' || e.IMPORT_MEMORY === '1') {
    return { ok: true, database: 'a_search_sandbox' };
  }
  return { ok: false, code: 'precheck_db', detail: 'MSSQL_DATABASE_required' };
}

async function main(envVars) {
  const env = envVars || process.env;
  const opts = parseArgs(process.argv);
  if (opts.help || opts.cmd === 'help') {
    process.stdout.write(
      'Usage: node walrus/import/cli.js run [--provider id] [--feed key] [--dry-run]\n',
    );
    process.exit(0);
  }
  if (opts.cmd !== 'run') {
    process.stderr.write(`unknown_command:${opts.cmd}\n`);
    process.exit(2);
  }

  const repoRoot = path.resolve(__dirname, '..', '..');
  const dbRes = resolveDatabase(env);
  if (!dbRes.ok) {
    process.stderr.write(`precheck_failed ${dbRes.code} ${dbRes.detail}\n`);
    await reportImportFailure({
      provider: '_run',
      feedKey: '_precheck',
      errorCode: dbRes.code,
      errorDetail: dbRes.detail,
      database: '',
      host: os.hostname(),
      token: env.A_SEARCH_GH_TOKEN || env.GITHUB_TOKEN,
      outboxRoot: env.A_SEARCH_IMPORT_FAILURE_OUTBOX,
    }).catch(() => {});
    process.exit(2);
  }
  const database = dbRes.database;
  const affiliatesRoot =
    env.A_AFFILIATES_ROOT || path.join('D:', 's3', 'a-affiliates');
  const merchantsRoot =
    env.A_MERCHANTS_ROOT || path.join('D:', 's3', 'a-merchants');

  const partEnv = database.includes('sandbox') ? 'sandbox' : 'live';
  // FR #4520: real SQL store unless unit/dev sets IMPORT_MEMORY=1.
  const store =
    env.IMPORT_MEMORY === '1'
      ? createMemoryStore({ env: partEnv })
      : createSqlStore({ env: partEnv, database, envVars: env });

  const failureRoot =
    env.A_SEARCH_IMPORT_FAILURE_OUTBOX ||
    path.join(process.cwd(), 'import-failures');

  try {
    // FR #4943: replay outbox from prior GH outages before this run.
    await flushFailureOutbox({
      outboxRoot: failureRoot,
      token: env.A_SEARCH_GH_TOKEN || env.GITHUB_TOKEN,
    }).catch(() => {});

    if (typeof store.loadPurgeRequests === 'function') {
      await store.loadPurgeRequests();
    }

    const result = await runDailyImport({
      repoRoot,
      database,
      affiliatesRoot,
      merchantsRoot,
      mountRoots: [affiliatesRoot, merchantsRoot],
      ftsInstalled: env.IMPORT_SKIP_FTS_CHECK === '1' ? true : true,
      store,
      dryRun: opts.dryRun,
      provider: opts.provider,
      feed: opts.feed,
      lockPath: env.A_SEARCH_IMPORT_LOCK,
      deleteOnSuccess: env.IMPORT_DELETE_ON_SUCCESS === '1',
      failureRoot,
      ghToken: env.A_SEARCH_GH_TOKEN || env.GITHUB_TOKEN,
      host: os.hostname(),
    });

    process.exit(result.exitCode);
  } finally {
    if (store && typeof store.close === 'function') {
      await store.close().catch(() => {});
    }
  }
}

if (require.main === module) {
  main().catch(async (err) => {
    const msg = String(err && err.stack ? err.stack : err);
    process.stderr.write(`${msg}\n`);
    try {
      await reportImportFailure({
        provider: '_run',
        feedKey: '_unhandled',
        errorCode: 'unhandled_exception',
        errorDetail: redactSecrets(msg).slice(0, 1800),
        database: process.env.MSSQL_DATABASE || '',
        host: os.hostname(),
        token: process.env.A_SEARCH_GH_TOKEN || process.env.GITHUB_TOKEN,
        outboxRoot: process.env.A_SEARCH_IMPORT_FAILURE_OUTBOX,
      });
    } catch {
      // last resort
    }
    process.exit(2);
  });
}

module.exports = { parseArgs, main, resolveDatabase };
