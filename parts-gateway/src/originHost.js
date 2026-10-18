'use strict';

/**
 * FR #3968: host comes from Origin only (?host= ignored).
 * Missing or unparseable Origin => origin_required.
 */

const { normalizeHost } = require('../../shared/components/customers');

/**
 * @param {unknown} originHeader
 * @returns {string|null} normalised host (incl. port when present) or null if absent/invalid
 */
function hostFromOriginHeader(originHeader) {
  if (originHeader == null || String(originHeader).trim() === '') {
    return null;
  }
  const raw = String(originHeader).trim();
  try {
    const u = new URL(raw);
    if (!u.host) return null;
    return normalizeHost(u.host);
  } catch {
    return null;
  }
}

/**
 * Require a parseable Origin hostname. Ignores any query host.
 * @param {unknown} originHeader
 * @returns {{ ok: true, host: string } | { ok: false, code: 'origin_required' }}
 */
function requireHostFromOrigin(originHeader) {
  const host = hostFromOriginHeader(originHeader);
  if (host == null) {
    return { ok: false, code: 'origin_required' };
  }
  return { ok: true, host };
}

module.exports = {
  hostFromOriginHeader,
  requireHostFromOrigin,
};
