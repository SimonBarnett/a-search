'use strict';

/**
 * FR #4511: startup config gate for the walrus SQL drain.
 * List every required env name that is missing so the process can exit
 * before any SQS ReceiveMessage (nothing pushed to the DLQ by a half-config).
 */

const { assertWritableDatabaseFromEnv } = require('./dbWriterGuard');

/** Env keys the drain / sql worker need for a successful SELECT-only job. */
const REQUIRED_DRAIN_ENV_KEYS = Object.freeze([
  'SQS_DB_BACKED_URL',
  'A_CLUBS_ROOT',
  'AWS_REGION',
  'MSSQL_SERVER',
  'MSSQL_DATABASE',
  // Auth: either MSSQL_TRUSTED_CONNECTION=true or MSSQL_USER + MSSQL_PASSWORD
  'MSSQL_USER',
  'MSSQL_PASSWORD',
  'MSSQL_TRUSTED_CONNECTION',
]);

/**
 * @param {Record<string, string|undefined>} [envVars]
 * @returns {string}
 */
function resolveQueueUrl(envVars) {
  const env = envVars || process.env;
  const aSearchEnv = String(env.A_SEARCH_ENV || '').trim().toLowerCase();
  if (aSearchEnv === 'live' && env.SQS_DB_BACKED_LIVE_URL) {
    return String(env.SQS_DB_BACKED_LIVE_URL).trim();
  }
  if (aSearchEnv === 'sandbox' && env.SQS_DB_BACKED_SANDBOX_URL) {
    return String(env.SQS_DB_BACKED_SANDBOX_URL).trim();
  }
  return String(env.SQS_DB_BACKED_URL || '').trim();
}

/**
 * @param {Record<string, string|undefined>} [envVars]
 * @returns {boolean}
 */
function isTrustedConnection(envVars) {
  const env = envVars || process.env;
  const trusted = String(env.MSSQL_TRUSTED_CONNECTION || '')
    .trim()
    .toLowerCase();
  return trusted === 'true' || trusted === '1' || trusted === 'yes';
}

/**
 * @param {Record<string, string|undefined>} [envVars]
 * @returns {string[]} missing required env names (stable order)
 */
function listMissingDrainEnv(envVars) {
  const env = envVars || process.env;
  /** @type {string[]} */
  const missing = [];

  if (!resolveQueueUrl(env)) {
    missing.push('SQS_DB_BACKED_URL');
  }
  if (!String(env.A_CLUBS_ROOT || env.A_SEARCH_A_CLUBS_ROOT || '').trim()) {
    missing.push('A_CLUBS_ROOT');
  }
  if (!String(env.AWS_REGION || env.AWS_DEFAULT_REGION || '').trim()) {
    missing.push('AWS_REGION');
  }
  if (!String(env.MSSQL_SERVER || '').trim()) {
    missing.push('MSSQL_SERVER');
  }
  if (!String(env.MSSQL_DATABASE || '').trim()) {
    missing.push('MSSQL_DATABASE');
  } else {
    try {
      assertWritableDatabaseFromEnv(env);
    } catch {
      missing.push('MSSQL_DATABASE');
    }
  }

  if (isTrustedConnection(env)) {
    // Trusted / service-account path: no SQL user/password required in env.
  } else {
    if (!String(env.MSSQL_USER || '').trim()) {
      missing.push('MSSQL_USER');
    }
    if (env.MSSQL_PASSWORD == null || String(env.MSSQL_PASSWORD) === '') {
      missing.push('MSSQL_PASSWORD');
    }
  }

  return missing;
}

/**
 * @param {Record<string, string|undefined>} [envVars]
 * @returns {{ ok: true } | { ok: false, missing: string[], message: string }}
 */
function assertDrainEnv(envVars) {
  const missing = listMissingDrainEnv(envVars);
  if (missing.length === 0) return { ok: true };
  return {
    ok: false,
    missing,
    message: `walrus-sql-drain missing config: ${missing.join(', ')}`,
  };
}

module.exports = {
  REQUIRED_DRAIN_ENV_KEYS,
  resolveQueueUrl,
  isTrustedConnection,
  listMissingDrainEnv,
  assertDrainEnv,
};
