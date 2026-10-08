'use strict';

/**
 * Madeira / madeiradb user, partner and club identity codes (FR-114).
 * Format matches dbo.Users.user_id: varchar(8), charset [0-9A-Z], length 8.
 * Production IDs should come from dbo.GenerateUniqueUserId (7 random + checksum);
 * checksum algorithm is not re-implemented here — inject a generator or call the proc.
 */

/** @type {RegExp} */
const USER_ID_RE = /^[0-9A-Z]{8}$/;

class UserIdError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'UserIdError';
    this.code = code;
  }
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidUserId(value) {
  if (typeof value !== 'string') return false;
  return USER_ID_RE.test(value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function assertUserId(value) {
  const s = value == null ? '' : String(value).trim();
  if (!isValidUserId(s)) {
    throw new UserIdError(
      'invalid_user_id',
      'user id must match ^[0-9A-Z]{8}$ (madeiradb Users.user_id)',
    );
  }
  return s;
}

module.exports = {
  USER_ID_RE,
  isValidUserId,
  assertUserId,
  UserIdError,
};
