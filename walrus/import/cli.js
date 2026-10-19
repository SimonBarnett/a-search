#!/usr/bin/env node
'use strict';

/**
 * FR #4463: walrus daily import CLI
 *   node walrus/import/cli.js run [--provider X] [--feed Y] [--dry-run]
 */

const path = require('node:path');
const { createMemoryStore } = require('./src/memoryStore');
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

  // Production path expects a real SQL store; unit/dev can set IMPORT_MEMORY=1.
  const store =
    process.env.IMPORT_MEMORY === '1'
      ? createMemoryStore({ env: database.includes('sandbox') ? 'sandbox' : 'live' })
      : createMemoryStore({ env: database.includes('sandbox') ? 'sandbox' : 'live' });

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
  });

  process.exit(result.exitCode);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(String(err && err.stack ? err.stack : err) + '\n');
    process.exit(2);
  });
}

module.exports = { parseArgs, main };
