'use strict';

/**
 * FR #3968: when Origin is present, require it to match ?host=.
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
 * @param {unknown} queryHost
 * @param {unknown} originHeader
 * @returns {{ ok: true } | { ok: false, code: string }}
 */
function assertHostMatchesOrigin(queryHost, originHeader) {
  const originHost = hostFromOriginHeader(originHeader);
  if (originHost == null) {
    return { ok: true };
  }
  let host;
  try {
    host = normalizeHost(queryHost);
  } catch (err) {
    const code = err && err.code ? String(err.code) : 'host_required';
    return { ok: false, code };
  }
  if (host !== originHost) {
    return { ok: false, code: 'widget_host_mismatch' };
  }
  return { ok: true };
}

module.exports = {
  hostFromOriginHeader,
  assertHostMatchesOrigin,
};
