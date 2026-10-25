/**
 * FR #5065: node entry for tools/invite.ps1 (cwd = agentRoot).
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { runRakutenInvite } = require('./rakutenInvite.js');

function parseArgv(argv) {
  let live = false;
  let max = 0;
  let headed = false;
  for (const a of argv) {
    if (a === '--live') live = true;
    else if (a === '--headed') headed = true;
    else if (a.startsWith('--max=')) max = Number(a.slice(6)) || 0;
  }
  return { live, max, headed };
}

const flags = parseArgv(process.argv.slice(2));
const agentMd = process.env.RAKUTEN_AGENT_MD || '';
let agentText = '';
if (agentMd && fs.existsSync(agentMd)) {
  agentText = fs.readFileSync(agentMd, 'utf8');
}

const result = await runRakutenInvite({
  live: flags.live,
  dryRun: !flags.live,
  max: flags.max || 20,
  agentMd: agentText,
  env: process.env,
  apply: flags.live
    ? async () => {
        const err = new Error('rakuten_apply_needs_browser');
        err.code = 'rakuten_apply_needs_browser';
        err.exitCode = 2;
        throw err;
      }
    : undefined,
});

process.stdout.write(`${JSON.stringify(result.report)}\n`);
process.stderr.write(
  `invite_result signIn=api live=${Boolean(flags.live)} candidates=${result.report.counts.candidates} applied=${result.report.counts.applied} failed=0 needsOtp=false\n`,
);
