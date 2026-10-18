'use strict';

/**
 * FR #3968 / #3987: page path for GUID metadata --- Prefer Referer path; else pageUri/uri query.
 */

/**
 * @param {{ referer?: string, Referer?: string, pageUri?: string, uri?: string }} opts
 * @returns {string} path starting with / or empty
 */
function resolvePageUri(opts) {
  const o = opts || {};
  const ref = String(o.referer || o.Referer || '').trim();
  if (ref) {
    try {
      const u = new URL(ref);
      return `${u.pathname || '/'}`.split('?')[0] || '/';
    } catch {
      if (ref.startsWith('/')) return ref.split('?')[0].split('#')[0];
    }
  }
  const explicit = String(o.pageUri || o.uri || '').trim();
  if (!explicit) return '';
  if (explicit.startsWith('/')) return explicit.split('?')[0].split('#')[0];
  try {
    const u = new URL(explicit);
    return `${u.pathname || '/'}`.split('?')[0] || '/';
  } catch {
    return explicit.startsWith('/') ? explicit : `/${explicit}`;
  }
}

module.exports = {
  resolvePageUri,
};
