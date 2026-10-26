'use strict';

/**
 * FR #5151: CLI for PowerShell folder tools.
 * node tools/reportToolFailure.js --tool meta --errorCode head_failed --detail "..." [--exitCode 1]
 */

const path = require('node:path');
const fs = require('node:fs');
const {
  reportToolFailure,
} = require('../shared/intake/reportToolFailure');

function argVal(argv, name) {
  const i = argv.indexOf(name);
  if (i < 0) return null;
  return argv[i + 1] || null;
}

function readVersion(toolsDir) {
  try {
    const v = path.join(toolsDir, '..', 'VERSION');
    if (fs.existsSync(v)) return fs.readFileSync(v, 'utf8').trim().slice(0, 32);
  } catch {
    // ignore
  }
  return process.env.A_SEARCH_VERSION || '';
}

async function main(argv) {
  const tool = argVal(argv, '--tool') || 'tool';
  const errorCode = argVal(argv, '--errorCode') || 'error';
  const detail = argVal(argv, '--detail') || '';
  const exitCode = argVal(argv, '--exitCode');
  const cwd = argVal(argv, '--cwd') || process.cwd();
  const s3Uri = argVal(argv, '--s3Uri') || '';
  const commandLine = argVal(argv, '--commandLine') || '';
  const awsIdentityArn = argVal(argv, '--awsIdentityArn') || '';
  const gitCommit = argVal(argv, '--gitCommit') || '';
  const runId = argVal(argv, '--runId');
  const outboxRoot = argVal(argv, '--outboxRoot');
  const toolsDir = path.resolve(__dirname);
  const r = await reportToolFailure({
    tool,
    errorCode,
    errorDetail: detail,
    exitCode: exitCode != null ? Number(exitCode) : undefined,
    cwd,
    s3Uri,
    commandLine,
    awsIdentityArn,
    gitCommit,
    version: readVersion(toolsDir),
    runId: runId != null ? runId : null,
    outboxRoot: outboxRoot || undefined,
    machine: process.env.COMPUTERNAME || 'tool',
  });
  process.stdout.write(JSON.stringify(r) + '\n');
  process.exit(r && r.ok ? 0 : 1);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(String(err && err.stack ? err.stack : err) + '\n');
    process.exit(2);
  });
}

module.exports = { main, argVal };
