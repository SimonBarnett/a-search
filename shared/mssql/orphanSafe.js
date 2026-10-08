'use strict';

/**
 * Orphan-safe tenant reads against madeiradb (FR-117).
 * Almost all user/partner/club code columns are logical only (no FK).
 * Read paths that resolve a JWT userId to DB rows must EXISTS-check
 * dbo.Users first and return empty (not throw) when the user is missing.
 */

class OrphanSafeError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'OrphanSafeError';
    this.code = code;
  }
}

/**
 * Normalize a user/partner/club code for comparison: trim + upper-case.
 * Does not enforce length here (shape validation is FR-114); empty -> ''.
 * @param {unknown} value
 * @returns {string}
 */
function normalizeUserCode(value) {
  if (value == null) return '';
  return String(value).trim().toUpperCase();
}

/**
 * SQL-oriented compare: both sides as trimmed upper varchar(8)-ish strings.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function userCodesEqual(a, b) {
  const left = normalizeUserCode(a);
  const right = normalizeUserCode(b);
  if (!left || !right) return false;
  return left === right;
}

/**
 * Gate: does dbo.Users contain this tenant code?
 * @param {object} opts
 * @param {unknown} opts.userId - JWT / tenant code
 * @param {(code: string) => Promise<boolean|object|null|undefined>|boolean|object|null|undefined} opts.userExists
 *   Injectable. Return truthy if Users has the code; falsy if missing.
 * @returns {Promise<{ ok: true, userId: string } | { ok: false, userId: string, reason: 'missing_user'|'empty_userId' }>}
 */
async function resolveTenantUser(opts = {}) {
  const userId = normalizeUserCode(opts.userId);
  if (!userId) {
    return { ok: false, userId: '', reason: 'empty_userId' };
  }
  if (typeof opts.userExists !== 'function') {
    throw new OrphanSafeError(
      'missing_userExists',
      'resolveTenantUser requires injectable opts.userExists',
    );
  }
  const found = await opts.userExists(userId);
  if (!found) {
    return { ok: false, userId, reason: 'missing_user' };
  }
  return { ok: true, userId };
}

/**
 * Run a user-scoped read only when the tenant exists in Users.
 * Missing user -> empty array (fail closed, not error).
 *
 * @template T
 * @param {object} opts
 * @param {unknown} opts.userId
 * @param {(code: string) => Promise<boolean|object|null|undefined>|boolean|object|null|undefined} opts.userExists
 * @param {(code: string) => Promise<T[]|T>|T[]|T} opts.query
 *   Called only when userExists is truthy; must return rows for that tenant.
 * @returns {Promise<T[]>}
 */
async function readForTenantUser(opts = {}) {
  const gate = await resolveTenantUser({
    userId: opts.userId,
    userExists: opts.userExists,
  });
  if (!gate.ok) {
    return [];
  }
  if (typeof opts.query !== 'function') {
    throw new OrphanSafeError(
      'missing_query',
      'readForTenantUser requires injectable opts.query',
    );
  }
  const rows = await opts.query(gate.userId);
  if (rows == null) return [];
  return Array.isArray(rows) ? rows : [rows];
}

/**
 * Drop rows whose owner code is not in the known Users set (defense in depth
 * after a query that could not EXISTS-join).
 * @param {object[]} rows
 * @param {string} ownerField - e.g. 'UserId' / 'user_id' / 'uid'
 * @param {Iterable<string>|Set<string>|Map<string, unknown>} knownUserCodes
 * @returns {object[]}
 */
function filterRowsToKnownUsers(rows, ownerField, knownUserCodes) {
  const known = new Set();
  if (knownUserCodes && typeof knownUserCodes[Symbol.iterator] === 'function') {
    for (const c of knownUserCodes) {
      const n = normalizeUserCode(c);
      if (n) known.add(n);
    }
  }
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    const code = normalizeUserCode(row[ownerField]);
    return code && known.has(code);
  });
}

/** Documented EXISTS preamble for SQL writers (varchar(8) compare). */
const USERS_EXISTS_SQL = `
EXISTS (
  SELECT 1
  FROM dbo.Users AS u
  WHERE u.user_id = CONVERT(varchar(8), @userId)
)
`.trim();

module.exports = {
  normalizeUserCode,
  userCodesEqual,
  resolveTenantUser,
  readForTenantUser,
  filterRowsToKnownUsers,
  USERS_EXISTS_SQL,
  OrphanSafeError,
};
