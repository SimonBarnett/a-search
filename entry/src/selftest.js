'use strict';

/**
 * Provider selftest stub helpers (FR-059b).
 * Empty providers[] until real probes (later FR-059 slices).
 */

const { queryParams } = require('./performance');

/**
 * @param {string} userId
 * @param {{ env: string }} opts
 */
function emptySelftestPayload(userId, opts) {
  return {
    ok: true,
    userId: String(userId),
    env: opts.env,
    providers: [],
    failed: [],
    intakeFiled: [],
  };
}

/**
 * @param {object} query
 * @param {object} body
 * @returns {{ ok: true, value: { env: string, sources?: string[] } } | { ok: false, error: string, fields?: string[] }}
 */
function resolveSelftestInput(query = {}, body = {}) {
  const sandbox =
    body.sandbox === true ||
    query.sandbox === true ||
    query.sandbox === 'true';
  const env = sandbox ? 'sandbox' : 'live';

  let sources;
  const rawSources =
    body.sources !== undefined ? body.sources : undefined;
  if (rawSources !== undefined) {
    if (
      !Array.isArray(rawSources) ||
      rawSources.some((s) => typeof s !== 'string')
    ) {
      return { ok: false, error: 'invalid_sources', fields: ['sources'] };
    }
    sources = rawSources.map((s) => String(s));
  }

  return { ok: true, value: { env, sources } };
}

module.exports = {
  emptySelftestPayload,
  resolveSelftestInput,
  queryParams,
};
