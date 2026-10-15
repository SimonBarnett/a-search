'use strict';

/**
 * FR-248 / FR-250 correction: partner iff Users.permissions contains 'partner'.
 * Parse array-like string; never raw LIKE '%partner%' substring.
 */

/**
 * @param {unknown} permissions
 * @returns {string[]}
 */
function parsePermissions(permissions) {
  if (permissions == null) return [];
  if (Array.isArray(permissions)) {
    return permissions.map((p) => String(p).trim().toLowerCase()).filter(Boolean);
  }
  const raw = String(permissions).trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw.replace(/'/g, '"'));
    if (Array.isArray(parsed)) {
      return parsed.map((p) => String(p).trim().toLowerCase()).filter(Boolean);
    }
  } catch {
    /* fall through */
  }
  // Bracket form: [partner,admin] or ['partner','admin']
  const inner = raw.replace(/^\[/, '').replace(/\]$/, '');
  return inner
    .split(',')
    .map((s) => s.replace(/^['"]|['"]$/g, '').trim().toLowerCase())
    .filter(Boolean);
}

/**
 * @param {{ permissions?: unknown, Permissions?: unknown }|null|undefined} user
 * @returns {boolean}
 */
function isPartner(user) {
  if (!user || typeof user !== 'object') return false;
  const perms = parsePermissions(
    user.permissions != null ? user.permissions : user.Permissions,
  );
  return perms.includes('partner');
}

module.exports = { isPartner, parsePermissions };
