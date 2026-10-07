'use strict';

/**
 * Idempotent merchant / advertiser user create for Awin onboarding (FR-050b).
 * Keyed by email — second call with the same email does not insert again.
 * Injectable SQL only (no live MSSQL in unit tests).
 */

class AwinUserError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'AwinUserError';
    this.code = code;
  }
}

/**
 * Normalize email for lookup / storage.
 * @param {unknown} email
 * @returns {string}
 */
function normalizeEmail(email) {
  return String(email == null ? '' : email)
    .trim()
    .toLowerCase();
}

/**
 * @param {object} opts
 * @param {string} opts.email
 * @param {string} [opts.companyName]
 * @param {string} [opts.website]
 * @param {string|number} [opts.advertiserId]
 * @param {string} [opts.env] - live|sandbox stamp
 * @param {string} [opts.source] - default awin
 * @param {(email: string) => Promise<object|null|undefined>} opts.findByEmail
 * @param {(row: object) => Promise<object>} opts.insertUser
 * @param {() => string} [opts.newUserId]
 * @returns {Promise<{ user: object, created: boolean }>}
 */
async function createMerchantUser(opts = {}) {
  const email = normalizeEmail(opts.email);
  if (!email || !email.includes('@')) {
    throw new AwinUserError(
      'invalid_email',
      'createMerchantUser requires a valid email',
    );
  }
  if (typeof opts.findByEmail !== 'function') {
    throw new AwinUserError(
      'missing_findByEmail',
      'createMerchantUser requires injectable opts.findByEmail',
    );
  }
  if (typeof opts.insertUser !== 'function') {
    throw new AwinUserError(
      'missing_insertUser',
      'createMerchantUser requires injectable opts.insertUser',
    );
  }

  const existing = await opts.findByEmail(email);
  if (existing && typeof existing === 'object') {
    return { user: existing, created: false };
  }

  const newUserId =
    typeof opts.newUserId === 'function'
      ? opts.newUserId()
      : `usr_${Date.now().toString(36)}`;

  const row = {
    user_id: newUserId,
    email,
    company_name:
      opts.companyName != null ? String(opts.companyName) : undefined,
    website: opts.website != null ? String(opts.website) : undefined,
    advertiserId:
      opts.advertiserId != null ? String(opts.advertiserId) : undefined,
    source: opts.source != null ? String(opts.source) : 'awin',
    env: opts.env != null ? String(opts.env) : undefined,
    createdAt: new Date().toISOString(),
  };

  const inserted = await opts.insertUser(row);
  const user =
    inserted && typeof inserted === 'object' ? { ...row, ...inserted } : row;
  return { user, created: true };
}

module.exports = {
  createMerchantUser,
  normalizeEmail,
  AwinUserError,
};
