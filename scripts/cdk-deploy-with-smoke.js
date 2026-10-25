#!/usr/bin/env node
'use strict';

/**
 * FR #4881: cdk deploy then IAM SigV4 smoke-deploy against SearchApiUrl.
 *
 *   node scripts/cdk-deploy-with-smoke.js --app "node cdk/bin/a-search.js" ASearchStack -c requireDeployEnv=true
 *   node scripts/cdk-deploy-with-smoke.js --stack ASearchStack --region eu-west-2 ...
 *
 * On cdk exit 0 runs: node scripts/smoke-deploy.js --stack <same> [--region <same>]
 * Non-zero smoke fails this script. Never prints credentials.
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DEFAULT_STACK = 'ASearchStack';
const SMOKE_SCRIPT = path.join(__dirname, 'smoke-deploy.js');

/**
 * @param {string[]} argv
 * @returns {{ stack?: string, region?: string, cdkArgs: string[] }}
 */
function parseArgs(argv) {
  const cdkArgs = [];
  let stack;
  let region;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stack') {
      if (argv[i + 1]) stack = String(argv[++i]).trim();
      continue;
    }
    if (a === '--region') {
      if (argv[i + 1]) {
        region = String(argv[++i]).trim();
        cdkArgs.push('--region', region);
      }
      continue;
    }
    if (a.startsWith('--region=')) {
      region = a.slice('--region='.length).trim();
      cdkArgs.push(a);
      continue;
    }
    if (a === '-c' || a === '--context') {
      const next = argv[i + 1];
      if (next) {
        cdkArgs.push(a, next);
        i += 1;
        const m = /^region=(.*)$/i.exec(String(next).trim());
        if (m && m[1].trim()) region = m[1].trim();
      } else {
        cdkArgs.push(a);
      }
      continue;
    }
    const ctxEq = /^(?:-c|--context)=region=(.*)$/i.exec(a);
    if (ctxEq && ctxEq[1].trim()) {
      region = ctxEq[1].trim();
      cdkArgs.push(a);
      continue;
    }
    cdkArgs.push(a);
  }
  return { stack, region, cdkArgs };
}

/**
 * Prefer explicit --stack, else A_SEARCH_STACK, else first positional cdk arg, else default.
 * @param {{ stack?: string, cdkArgs: string[], env?: NodeJS.ProcessEnv }} opts
 */
function resolveStackName(opts) {
  if (opts.stack && String(opts.stack).trim()) return String(opts.stack).trim();
  const env = opts.env || process.env;
  if (env.A_SEARCH_STACK && String(env.A_SEARCH_STACK).trim()) {
    return String(env.A_SEARCH_STACK).trim();
  }
  for (const a of opts.cdkArgs || []) {
    if (!a || a.startsWith('-')) continue;
    // skip values that look like app entrypoints / paths
    if (/\.[cm]?js$/i.test(a) || /[\\/]/.test(a)) continue;
    return String(a).trim();
  }
  return DEFAULT_STACK;
}

/**
 * Ensure the resolved stack name is present as a cdk positional when only --stack was used.
 * @param {string[]} cdkArgs
 * @param {string} stackName
 */
function ensureStackPositional(cdkArgs, stackName) {
  const hasPositional = cdkArgs.some((a) => a && !a.startsWith('-') && !/\.[cm]?js$/i.test(a) && !/[\\/]/.test(a));
  if (hasPositional) return cdkArgs.slice();
  return [stackName, ...cdkArgs];
}

/**
 * @param {object} opts
 * @param {string[]} [opts.argv]
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {string} [opts.cwd]
 * @param {typeof spawnSync} [opts.spawn]
 * @param {string} [opts.nodePath]
 * @param {boolean} [opts.skipSmoke] - test hook
 * @returns {{ ok: boolean, stackName: string, region?: string, cdkStatus: number|null, smokeStatus: number|null }}
 */
function runCdkDeployWithSmoke(opts) {
  const argv = (opts && opts.argv) || process.argv.slice(2);
  const env = (opts && opts.env) || process.env;
  const cwd = (opts && opts.cwd) || ROOT;
  const spawn = (opts && opts.spawn) || spawnSync;
  const nodePath = (opts && opts.nodePath) || process.execPath;

  const parsed = parseArgs(argv);
  const stackName = resolveStackName({
    stack: parsed.stack,
    cdkArgs: parsed.cdkArgs,
    env,
  });
  const region = parsed.region || undefined;
  const cdkArgs = ensureStackPositional(parsed.cdkArgs, stackName);

  const cdk = spawn(
    'npx',
    ['--no-install', 'cdk', 'deploy', ...cdkArgs],
    {
      cwd,
      env,
      encoding: 'utf8',
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  );
  const cdkStatus = cdk && typeof cdk.status === 'number' ? cdk.status : 1;
  if (cdkStatus !== 0) {
    return {
      ok: false,
      stackName,
      region,
      cdkStatus,
      smokeStatus: null,
    };
  }

  if (opts && opts.skipSmoke) {
    return { ok: true, stackName, region, cdkStatus, smokeStatus: 0 };
  }

  const smokeArgs = [SMOKE_SCRIPT, '--stack', stackName];
  if (region) smokeArgs.push('--region', region);

  const smoke = spawn(nodePath, smokeArgs, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  const smokeStatus =
    smoke && typeof smoke.status === 'number' ? smoke.status : 1;
  return {
    ok: smokeStatus === 0,
    stackName,
    region,
    cdkStatus,
    smokeStatus,
  };
}

function main(argv) {
  const result = runCdkDeployWithSmoke({ argv: argv || process.argv.slice(2) });
  if (!result.ok) {
    const which =
      result.cdkStatus !== 0
        ? `cdk deploy exit ${result.cdkStatus}`
        : `smoke-deploy exit ${result.smokeStatus}`;
    process.stderr.write(`FR #4881: ${which} (stack ${result.stackName})\n`);
    process.exit(result.cdkStatus !== 0 ? result.cdkStatus || 1 : result.smokeStatus || 1);
  }
}

module.exports = {
  parseArgs,
  resolveStackName,
  ensureStackPositional,
  runCdkDeployWithSmoke,
  DEFAULT_STACK,
  SMOKE_SCRIPT,
  ROOT,
};

if (require.main === module) {
  main();
}
