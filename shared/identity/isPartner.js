'use strict';

/**
 * FR-250 / #1364: partner status from madeiradb Users.permissions (read-only).
 * A user is a partner iff the parsed permissions array contains the exact token
 * "partner" (not a substring match such as "partnership").
 *
 * a-search never writes madeiradb (FR-251). Prefer mdb.Users view when querying.
 */

const { assertUserId } = require('./userId');

/** Parameterised SELECT through the FR-251 mdb view (never dbo.Users directly). */
const isPartnerSql =
  "SELECT 1 AS ok FROM mdb.Users WHERE user_id = @code AND permissions IS NOT NULL";

/**
 * Parse a madeiradb Users.permissions JSON-ish array string into tokens.
 * Accepts double- or single-quoted JSON array forms. Returns [] on empty/invalid.
 * @param {unknown} raw
 * @returns {string[]}
 */
function parsePermissions(raw) {
  if (raw == null) return [];
  let s = String(raw).trim();
  if (!s) return [];
  // Normalise single-quoted array to JSON double-quotes for JSON.parse.
  if (s.startsWith('[') && s.includes("'")) {
    s = s.replace(/'/g, '"');
  }
  try {
    const parsed = JSON.parse(s);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((t) => String(t == null ? '' : t).trim().toLowerCase())
      .filter((t) => t.length > 0);
  } catch {
    return [];
  }
}

/**
 * @param {unknown} rawPermissions
 * @returns {boolean}
 */
function permissionsContainPartner(rawPermissions) {
  return parsePermissions(rawPermissions).includes('partner');
}

/**
 * In-memory / row helper. Prefer this over Partner table or Users.role.
 * @param {{ permissions?: unknown, Permissions?: unknown }|null|undefined} user
 * @returns {boolean}
 */
function isPartner(user) {
  if (!user || typeof user !== 'object') return false;
  const raw =
    user.permissions !== undefined ? user.permissions : user.Permissions;
  return permissionsContainPartner(raw);
}

/**
 * Read-only DB lookup via injectable query fn (mssql-style).
 * Caches results in the optional Map for the process lifetime of the caller.
 *
 * @param {{
 *   query: (sql: string, params: { code: string }) => Promise<{ recordset?: object[] }|object[]>,
 * }} db
 * @param {unknown} code
 * @param {{ cache?: Map<string, boolean> }} [opts]
 * @returns {Promise<boolean>}
 */
async function isPartnerFromDb(db, code, opts = {}) {
  const id = assertUserId(code);
  const cache = opts.cache;
  if (cache && cache.has(id)) return cache.get(id);
  if (!db || typeof db.query !== 'function') {
    throw new Error('isPartnerFromDb requires db.query');
  }
  const result = await db.query(
    'SELECT permissions FROM mdb.Users WHERE user_id = @code',
    { code: id },
  );
  const rows = Array.isArray(result)
    ? result
    : (result && result.recordset) || [];
  const row = rows[0];
  const ok = isPartner(row || {});
  if (cache) cache.set(id, ok);
  return ok;
}

module.exports = {
  isPartnerSql,
  parsePermissions,
  permissionsContainPartner,
  isPartner,
  isPartnerFromDb,
};
