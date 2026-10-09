#!/usr/bin/env node
'use strict';

/**
 * FR-141 pin helper: exercise resolveDeployEnv without loading aws-cdk-lib.
 * Usage:
 *   node scripts/fr141-check-deploy-env.js
 *   node scripts/fr141-check-deploy-env.js --account 123456789012
 * Env: A_SEARCH_REQUIRE_DEPLOY_ENV, CDK_DEFAULT_ACCOUNT, CDK_DEFAULT_REGION
 */

const { resolveDeployEnv } = require('../cdk/lib/resolve-deploy-env');

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

try {
  const resolved = resolveDeployEnv({
    context: {
      account: argValue('--account'),
      region: argValue('--region'),
      requireDeployEnv:
        process.env.A_SEARCH_REQUIRE_DEPLOY_ENV || argValue('--require') || true,
    },
  });
  process.stdout.write(
    JSON.stringify({ ok: true, account: resolved.account, region: resolved.region }) +
      '\n',
  );
} catch (err) {
  process.stderr.write((err && err.message ? err.message : String(err)) + '\n');
  process.exit(1);
}
