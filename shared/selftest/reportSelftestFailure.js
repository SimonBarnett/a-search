'use strict';

/**
 * FR-059e: selftest probe ok=false → bobiverse intake (repo=SimonBarnett/a-search).
 * Deduped by sha256(provider|env|error). No secrets in title/body (redact via reportException).
 */

const crypto = require('node:crypto');
const {
  reportException,
  clearReportExceptionDedupe,
  DEFAULT_REPO,
  DEFAULT_INTAKE_URL,
} = require('../intake/reportException');

/**
 * @param {{ provider: string, env: string, error: string }} parts
 * @returns {string}
 */
function selftestIdempotencyKey(parts) {
  const provider = parts.provider != null ? String(parts.provider) : '';
  const env = parts.env != null ? String(parts.env) : '';
  const error = parts.error != null ? String(parts.error) : '';
  return crypto
    .createHash('sha256')
    .update(`${provider}|${env}|${error}`, 'utf8')
    .digest('hex');
}

/**
 * File one intake issue for a failed selftest probe.
 *
 * @param {{
 *   provider: string,
 *   env: 'live'|'sandbox'|string,
 *   error?: string,
 *   latencyMs?: number,
 *   reportException?: typeof reportException,
 *   fetch?: typeof fetch,
 *   intakeUrl?: string,
 *   force?: boolean,
 * }} opts
 */
async function reportSelftestFailure(opts = {}) {
  const provider = String(opts.provider || '').trim();
  const env = String(opts.env || '').trim();
  if (!provider) {
    throw new TypeError('reportSelftestFailure: provider required');
  }
  if (!env) {
    throw new TypeError('reportSelftestFailure: env required');
  }
  const error =
    opts.error != null && String(opts.error).trim()
      ? String(opts.error).trim()
      : 'probe_failed';
  const report = opts.reportException || reportException;
  const route = `entry/selftest/${env}/${provider}`;
  const latencyLine =
    opts.latencyMs != null && Number.isFinite(Number(opts.latencyMs))
      ? `latencyMs: ${Number(opts.latencyMs)}`
      : null;

  return report({
    code: 'selftest_probe_failed',
    message: error,
    route,
    source: provider,
    title: `a-search selftest fail: ${provider} @ ${env}`.slice(0, 200),
    body: [
      `provider: ${provider}`,
      `env: ${env}`,
      `error: ${error}`,
      latencyLine,
      'repo: SimonBarnett/a-search',
    ]
      .filter(Boolean)
      .join('\n'),
    repo: DEFAULT_REPO,
    kind: 'issue',
    idempotencyKey: selftestIdempotencyKey({ provider, env, error }),
    fetch: opts.fetch,
    intakeUrl: opts.intakeUrl,
    force: opts.force,
  });
}

/**
 * For each providers[] row with ok=false, file intake (deduped).
 *
 * @param {{
 *   providers: Array<{ ok?: boolean, source?: string, error?: string, latencyMs?: number }>,
 *   env: string,
 *   reportSelftestFailure?: typeof reportSelftestFailure,
 *   fetch?: typeof fetch,
 *   intakeUrl?: string,
 * }} opts
 * @returns {Promise<{ intakeFiled: string[] }>}
 */
async function reportSelftestFailures(opts = {}) {
  const env = String(opts.env || '').trim();
  if (!env) {
    throw new TypeError('reportSelftestFailures: env required');
  }
  const reportOne = opts.reportSelftestFailure || reportSelftestFailure;
  const providers = Array.isArray(opts.providers) ? opts.providers : [];
  /** @type {string[]} */
  const intakeFiled = [];

  for (const row of providers) {
    if (!row || row.ok !== false) continue;
    const provider = String(row.source || '').trim();
    if (!provider) continue;
    const result = await reportOne({
      provider,
      env,
      error: row.error,
      latencyMs: row.latencyMs,
      fetch: opts.fetch,
      intakeUrl: opts.intakeUrl,
    });
    if (result && !result.skipped) {
      intakeFiled.push(provider);
    }
  }

  return { intakeFiled };
}

function clearSelftestFailureDedupe() {
  clearReportExceptionDedupe();
}

module.exports = {
  reportSelftestFailure,
  reportSelftestFailures,
  selftestIdempotencyKey,
  clearSelftestFailureDedupe,
  DEFAULT_REPO,
  DEFAULT_INTAKE_URL,
};
