'use strict';

/**
 * FR-153: resolve HttpApi CORS allowlist from CDK context.
 *
 * Context key (cdk -c):
 *   corsOrigins  comma-separated origins
 *
 * Default when unset: http://localhost:3000 (synth / local fixtures).
 * Empty string: deny (no origins).
 * Bare '*' (or any list entry '*') is rejected - production wildcard is OOS.
 */

/** @type {readonly string[]} */
const DEFAULT_SYNTH_ORIGINS = Object.freeze(['http://localhost:3000']);

/**
 * @param {Record<string, unknown>} [context]
 * @returns {string[]}
 */
function resolveCorsOrigins(context) {
  const ctx = context || {};
  if (!Object.prototype.hasOwnProperty.call(ctx, 'corsOrigins')) {
    return [...DEFAULT_SYNTH_ORIGINS];
  }
  const raw = ctx.corsOrigins;
  if (raw === undefined || raw === null) {
    return [...DEFAULT_SYNTH_ORIGINS];
  }
  const text = String(raw).trim();
  if (text === '') {
    return [];
  }
  const origins = text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const origin of origins) {
    if (origin === '*') {
      const err = new Error(
        'FR-153: corsOrigins must not include public wildcard "*". Pass an explicit allowlist (e.g. -c corsOrigins=https://club.example).',
      );
      err.code = 'A_SEARCH_CORS_WILDCARD';
      throw err;
    }
  }
  return origins;
}

module.exports = {
  resolveCorsOrigins,
  DEFAULT_SYNTH_ORIGINS,
};
