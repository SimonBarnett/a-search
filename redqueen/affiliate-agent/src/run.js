'use strict';

/**
 * FR #4701: provider-aware affiliate agent entry (Awin + Rakuten).
 * Resolve provider from cwd under a-affiliates/{provider}; no Rakuten fork of Awin run.js.
 */

const path = require('node:path');
const { resolveProviderFromCwd } = require('./cwd');
const { runRakutenAgent } = require('./rakuten/run');

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const out = { dryRun: false, cwd: process.cwd(), help: false };
  const args = argv || [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '-DryRun' || a === '--dry-run') out.dryRun = true;
    else if (a === '-?' || a === '-h' || a === '--help') out.help = true;
    else if (a === '-Cwd' || a === '--cwd') {
      out.cwd = args[i + 1] || out.cwd;
      i += 1;
    }
  }
  return out;
}

function helpText() {
  return [
    'affiliate-agent (FR #4123 / #4701)',
    'Usage: node redqueen/affiliate-agent/src/run.js [-DryRun] [-Cwd <path>]',
    '  or:  tools/agent.ps1 [-DryRun]   (from S:\\a-affiliates\\{awin|rakuten})',
    '',
    'Providers: awin, rakuten',
    '  awin    — daily invite/join + feed folders (FR #4123)',
    '  rakuten — daily advertiser applications/approvals only (FR #4701; no SQL feeds)',
    '',
    'Load order: a-affiliates/AGENTS.md, SKILLS.md, {provider}/AGENT.md, SKILLS.md',
    'Secrets: C:\\passwords\\awin.secret.txt | C:\\passwords\\rakuten.secret.txt (never printed)',
  ].join('\n');
}

/**
 * @param {{
 *   dryRun?: boolean,
 *   cwd?: string,
 *   [key: string]: unknown,
 * }} opts
 */
async function runAffiliateAgent(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const resolved = resolveProviderFromCwd(cwd);
  if (!resolved.ok) {
    return {
      ok: false,
      code: resolved.code,
      detail: resolved.detail,
    };
  }
  if (resolved.provider === 'awin') {
    const { runAwinAgent } = require('../../awin-agent/src/run');
    return runAwinAgent({
      ...opts,
      dryRun: opts.dryRun,
    });
  }
  if (resolved.provider === 'rakuten') {
    return runRakutenAgent({
      ...opts,
      dryRun: opts.dryRun,
      affiliatesRoot: resolved.affiliatesRoot,
      providerRoot: resolved.providerRoot,
    });
  }
  return { ok: false, code: 'unsupported_provider', detail: resolved.provider };
}

async function main(argv = process.argv.slice(2)) {
  const flags = parseArgs(argv);
  if (flags.help) {
    process.stdout.write(`${helpText()}\n`);
    return;
  }
  const result = await runAffiliateAgent({
    dryRun: flags.dryRun,
    cwd: flags.cwd,
  });
  if (result.code === 'already_running') {
    process.exitCode = 0;
    return;
  }
  if (!result.ok) {
    process.exitCode =
      result.code === 'not_a_affiliates_provider' ||
      result.code === 'unsupported_provider'
        ? 3
        : 2;
    if (!result.report) {
      process.stderr.write(
        `${JSON.stringify({ ok: false, code: result.code, detail: result.detail || result.path })}\n`,
      );
    }
  }
}

module.exports = {
  parseArgs,
  helpText,
  runAffiliateAgent,
  resolveProviderFromCwd,
  main,
};

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        error: String((err && err.code) || (err && err.message) || err),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
