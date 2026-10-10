'use strict';

/**
 * FR-155: cost allocation tags for ASearchStack resources.
 *
 * Context keys (cdk -c), first match wins for Env:
 *   stage | env | costEnv
 *
 * Always:
 *   Project = a-search
 *
 * Default Env when unset/empty: default (deterministic synth).
 * AWS Organizations tag policies are OOS.
 */

const PROJECT_TAG = 'a-search';
const DEFAULT_ENV_TAG = 'default';

/**
 * @param {Record<string, unknown>} [context]
 * @returns {{ Project: string, Env: string }}
 */
function resolveCostTags(context) {
  const ctx = context || {};
  const raw =
    ctx.stage !== undefined && ctx.stage !== null
      ? ctx.stage
      : ctx.env !== undefined && ctx.env !== null
        ? ctx.env
        : ctx.costEnv;
  let env = DEFAULT_ENV_TAG;
  if (raw !== undefined && raw !== null) {
    const text = String(raw).trim();
    if (text !== '') env = text;
  }
  return { Project: PROJECT_TAG, Env: env };
}

module.exports = {
  resolveCostTags,
  PROJECT_TAG,
  DEFAULT_ENV_TAG,
};
