'use strict';

/**
 * FR #4943: folder dbimport failure -> same reporter as walrus/import.
 * Usage: node reportFailure.js --provider awin --feedKey 116097 --errorCode sql_error [--detail "..."]
 */

const path = require('node:path');
const {
  reportImportFailure,
} = require('../../walrus/import/src/reportImportFailure');

function argVal(argv, name) {
  const i = argv.indexOf(name);
  if (i < 0) return null;
  return argv[i + 1] || null;
}

async function main(argv) {
  const provider = argVal(argv, '--provider') || '_run';
  const feedKey = argVal(argv, '--feedKey') || argVal(argv, '--affiliateId') || '_run';
  const errorCode = argVal(argv, '--errorCode') || 'dbimport_error';
  const detail = argVal(argv, '--detail') || '';
  const runId = argVal(argv, '--runId');
  const r = await reportImportFailure({
    provider,
    feedKey,
    errorCode,
    errorDetail: detail,
    runId: runId != null ? runId : null,
    machine: process.env.COMPUTERNAME || 'dbimport',
  });
  process.stdout.write(JSON.stringify(r) + "\n");
  process.exit(r && r.ok ? 0 : 1);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(String(err && err.stack ? err.stack : err) + "\n");
    process.exit(2);
  });
}

module.exports = { main, argVal };
