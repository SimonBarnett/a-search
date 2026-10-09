'use strict';

/**
 * FR-141: resolve CDK deploy env from context / process env.
 * Never hardcode AWS account IDs here.
 *
 * Context keys (cdk -c):
 *   account | deployAccount
 *   region  | deployRegion
 *   requireDeployEnv=true  → fail if account missing (npm run deploy)
 *
 * Fallback: CDK_DEFAULT_ACCOUNT / CDK_DEFAULT_REGION.
 * Default region when unset: eu-west-2 (no default account).
 */

/**
 * @param {unknown} v
 * @returns {boolean}
 */
function isTruthyContext(v) {
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  }
  return false;
}

/**
 * @param {{
 *   context?: Record<string, unknown>,
 *   env?: NodeJS.ProcessEnv,
 * }} [opts]
 * @returns {{ account: string|undefined, region: string }}
 */
function resolveDeployEnv(opts) {
  const context = (opts && opts.context) || {};
  const env = (opts && opts.env) || process.env;

  const accountRaw =
    context.account ||
    context.deployAccount ||
    env.CDK_DEFAULT_ACCOUNT ||
    undefined;
  const account =
    accountRaw === undefined || accountRaw === null || accountRaw === ''
      ? undefined
      : String(accountRaw).trim() || undefined;

  const regionRaw =
    context.region ||
    context.deployRegion ||
    env.CDK_DEFAULT_REGION ||
    'eu-west-2';
  const region = String(regionRaw).trim() || 'eu-west-2';

  const requireDeployEnv =
    isTruthyContext(context.requireDeployEnv) ||
    isTruthyContext(env.A_SEARCH_REQUIRE_DEPLOY_ENV);

  if (requireDeployEnv && !account) {
    const err = new Error(
      'FR-141: missing deploy account. Pass -c account=ACCOUNT_ID (or -c deployAccount=...) or set CDK_DEFAULT_ACCOUNT. Do not hardcode account IDs in source.',
    );
    err.code = 'A_SEARCH_MISSING_DEPLOY_ACCOUNT';
    throw err;
  }

  return { account, region };
}

module.exports = {
  resolveDeployEnv,
  isTruthyContext,
};
