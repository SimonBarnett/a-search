'use strict';

/**
 * Provider selftest helpers (FR-059b + FR-152 orchestrator wire).
 * emptySelftestPayload kept for unit fixtures; production path builds
 * payloads from runSelftestOrchestrator via buildSelftestPayload.
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
 * Map orchestrator rows (source) to HTTP docs shape (id).
 *
 * @param {string} userId
 * @param {{
 *   env: string,
 *   providers: Array<{ ok: boolean, source: string, latencyMs?: number, error?: string }>,
 *   failed: string[],
 *   intakeFiled?: string[],
 * }} orch
 */
function buildSelftestPayload(userId, orch) {
  const providers = (orch.providers || []).map((row) => {
    /** @type {{ id: string, ok: boolean, error?: string }} */
    const out = {
      id: String(row.source),
      ok: row.ok === true,
    };
    if (!out.ok && row.error) {
      out.error = String(row.error);
    } else if (row.error) {
      out.error = String(row.error);
    }
    return out;
  });
  return {
    ok: true,
    userId: String(userId),
    env: orch.env,
    providers,
    failed: Array.isArray(orch.failed) ? orch.failed.map(String) : [],
    intakeFiled: Array.isArray(orch.intakeFiled)
      ? orch.intakeFiled.map(String)
      : [],
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
  buildSelftestPayload,
  resolveSelftestInput,
  queryParams,
};
