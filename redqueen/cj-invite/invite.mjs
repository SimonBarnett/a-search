#!/usr/bin/env node
/**
 * FR #5066: CJ invite entry (agentRoot = this folder on redqueen).
 * Dispatcher: tools/invite.ps1 → config.json agentRoot + runFromAgentRoot.
 */
import { runCjInvite, EXIT_OK } from './lib/runInvite.js';

function parseArgs(argv) {
  let live = false;
  let headed = false;
  let max = 0;
  let otp = '';
  for (const a of argv) {
    if (a === '--live') live = true;
    else if (a === '--headed') headed = true;
    else if (a.startsWith('--max=')) max = parseInt(a.slice(6), 10) || 0;
    else if (a.startsWith('--otp=')) otp = a.slice(6);
  }
  return { live, headed, max, otp };
}

const args = parseArgs(process.argv.slice(2));
if (args.otp) {
  console.error(
    'cj_invite: OTP/captcha must be handled by Simon (no auto loop). Pass through Account Manager supervised run.',
  );
}
const result = await runCjInvite({
  live: args.live,
  max: args.max,
  companyId: process.env.CJ_COMPANY_ID || process.env.CJ_PUBLISHER_CID,
  secretFile: process.env.CJ_SECRET_FILE,
  token: process.env.CJ_API_TOKEN,
});
process.exit(typeof result.code === 'number' ? result.code : EXIT_OK);
