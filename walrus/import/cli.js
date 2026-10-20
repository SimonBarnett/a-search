#!/usr/bin/env node
'use strict';

/**
 * FR #4463 / #4520: walrus daily import CLI
 * node walrus/import/cli.js run [--provider X] [--feed Y] [--dry-run]
 *
 * Production uses mssql store (ingest.* + MERGE dbo.Parts) unless IMPORT_MEMORY=1.
 */

const path = require('node:path');
const { createMemoryStore } = require('./src/memoryStore');
const { createSqlStore } = require('./src/sqlStore');
const { runDailyImport } = require('./src/runImport');

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

async function main() {
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
  const database = String(process.env.MSSQL_DATABASE || 'a_search_sandbox').toLowerCase();
  const affiliatesRoot =
    process.env.A_AFFILIATES_ROOT || path.join('D:', 's3', 'a-affiliates');
  const merchantsRoot =
    process.env.A_MERCHANTS_ROOT || path.join('D:', 's3', 'a-merchants');

  const partEnv = database.includes('sandbox') ? 'sandbox' : 'live';
  // FR #4520: real SQL store unless unit/dev sets IMPORT_MEMORY=1.
  const store =
    process.env.IMPORT_MEMORY === '1'
      ? createMemoryStore({ env: partEnv })
      : createSqlStore({ env: partEnv, database, envVars: process.env });

  try {
    if (typeof store.loadPurgeRequests === 'function') {
      await store.loadPurgeRequests();
    }

    const result = await runDailyImport({
      repoRoot,
      database,
      affiliatesRoot,
      merchantsRoot,
      mountRoots: [affiliatesRoot, merchantsRoot],
      ftsInstalled: process.env.IMPORT_SKIP_FTS_CHECK === '1' ? true : true,
      store,
      dryRun: opts.dryRun,
      provider: opts.provider,
      feed: opts.feed,
      lockPath: process.env.A_SEARCH_IMPORT_LOCK,
      deleteOnSuccess: process.env.IMPORT_DELETE_ON_SUCCESS === '1',
    });

    process.exit(result.exitCode);
  } finally {
    if (store && typeof store.close === 'function') {
      await store.close().catch(() => {});
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(String(err && err.stack ? err.stack : err) + '\n');
    process.exit(2);
  });
}

module.exports = { parseArgs, main };
