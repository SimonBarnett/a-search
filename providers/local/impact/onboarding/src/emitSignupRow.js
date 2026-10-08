'use strict';

const { assertUserId, UserIdError } = require('../../../../../shared/identity/userId');

/**
 * Build daily-report signup row for Impact onboarding (FR-051c).
 * Persistence to S3/MSSQL is FR-052 — this only shapes the object.
 *
 * Shared schema subset with Awin (FR-050c): user_id, company_name, email,
 * advertiserId, env (+ optional website/logoUrl/primarySector/description/
 * onboardedAt/source/status).
 */

class ImpactSignupError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'ImpactSignupError';
    this.code = code;
  }
}

/** @type {readonly string[]} — same required keys as Awin FR-050c */
const REQUIRED_KEYS = Object.freeze([
  'user_id',
  'company_name',
  'email',
  'advertiserId',
  'env',
]);

/**
 * @param {object} opts
 * @param {string} opts.user_id
 * @param {string} opts.company_name
 * @param {string} opts.email
 * @param {string|number} opts.advertiserId
 * @param {string} opts.env - live|sandbox
 * @param {string} [opts.website]
 * @param {string} [opts.logoUrl]
 * @param {string} [opts.primarySector]
 * @param {string} [opts.description]
 * @param {string} [opts.onboardedAt] - ISO-8601; default now
 * @param {string} [opts.source] - default impact
 * @param {string} [opts.status] - default joined
 * @returns {object}
 */
function emitSignupRow(opts = {}) {
  const user_id = opts.user_id != null ? String(opts.user_id).trim() : '';
  const company_name =
    opts.company_name != null ? String(opts.company_name).trim() : '';
  const email =
    opts.email != null ? String(opts.email).trim().toLowerCase() : '';
  const advertiserId =
    opts.advertiserId != null ? String(opts.advertiserId).trim() : '';
  const env = opts.env != null ? String(opts.env).trim() : '';

  if (!user_id) {
    throw new ImpactSignupError('missing_user_id', 'signup requires user_id');
  }
  try {
    assertUserId(user_id);
  } catch (err) {
    if (err instanceof UserIdError) {
      throw new ImpactSignupError('invalid_user_id', err.message);
    }
    throw err;
  }
  if (!company_name) {
    throw new ImpactSignupError(
      'missing_company_name',
      'signup requires company_name',
    );
  }
  if (!email || !email.includes('@')) {
    throw new ImpactSignupError(
      'invalid_email',
      'signup requires a valid email',
    );
  }
  if (!advertiserId) {
    throw new ImpactSignupError(
      'missing_advertiserId',
      'signup requires advertiserId',
    );
  }
  if (env !== 'live' && env !== 'sandbox') {
    throw new ImpactSignupError(
      'invalid_env',
      'signup env must be live|sandbox',
    );
  }

  const onboardedAt =
    opts.onboardedAt != null
      ? String(opts.onboardedAt)
      : new Date().toISOString();

  return {
    source: opts.source != null ? String(opts.source) : 'impact',
    status: opts.status != null ? String(opts.status) : 'joined',
    user_id,
    company_name,
    email,
    advertiserId,
    env,
    website: opts.website != null ? String(opts.website) : undefined,
    logoUrl: opts.logoUrl != null ? String(opts.logoUrl) : undefined,
    primarySector:
      opts.primarySector != null ? String(opts.primarySector) : undefined,
    description:
      opts.description != null ? String(opts.description) : undefined,
    onboardedAt,
  };
}

/**
 * @param {object} row
 * @returns {boolean}
 */
function assertSignupRequiredKeys(row) {
  for (const key of REQUIRED_KEYS) {
    if (row == null || row[key] == null || String(row[key]).trim() === '') {
      return false;
    }
  }
  return true;
}

module.exports = {
  emitSignupRow,
  assertSignupRequiredKeys,
  REQUIRED_KEYS,
  ImpactSignupError,
};
