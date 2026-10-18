'use strict';

/**
 * FR #3968: host comes from Origin only (?host= ignored).
 * FR #4107: when Origin is an embed/iframe host (e.g. *.filesusr.com), resolve
 * the club domain — never use the embed host as a-clubs hostkey.
 * Missing or unparseable Origin => origin_required.
 * Ambiguous / unknown embed => club_domain_unresolved (no folder, no queue).
 */

const { normalizeHost } = require('../../shared/components/customers');
const {
  isEmbedFrameHost,
  matchEmbedPatternId,
} = require('./embedHostPatterns');

/**
 * Wix filesusr encoding (verified from vendor docs + live sample
 * www-mymodelflyingclub-co-uk.filesusr.com ↔ www.mymodelflyingclub.co.uk):
 * replace every `.` in the club hostname with `-`, then append `.filesusr.com`.
 * Literal hyphens in the club domain are left as `-`, so decode is lossy —
 * parent Origin (X-Parent-Origin) disambiguates when present and consistent.
 *
 * @param {string} clubHost normalised club hostname (no port unless non-default)
 * @returns {string} filesusr label (no .filesusr.com suffix)
 */
function encodeWixFilesusrLabel(clubHost) {
  const h = String(clubHost || '')
    .toLowerCase()
    .trim()
    .split(':')[0];
  return h.replace(/\./g, '-');
}

/**
 * Primary decode: every hyphen was a dot (inverse of documented Wix encoding).
 * Correct for clubs without literal hyphens in labels; hyphenated clubs need
 * a consistent X-Parent-Origin.
 *
 * @param {string} label subdomain before .filesusr.com
 * @returns {string|null}
 */
function decodeWixFilesusrLabelNaive(label) {
  const raw = String(label || '')
    .toLowerCase()
    .trim();
  if (!raw || raw.includes('.') || raw.includes('/')) return null;
  const decoded = raw.replace(/-/g, '.');
  if (!decoded.includes('.') || decoded.startsWith('.') || decoded.endsWith('.')) {
    return null;
  }
  if (decoded.includes('..')) return null;
  return decoded;
}

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
 * Resolve club host from Origin (+ optional parent Origin for embed frames).
 * @param {{
 *   origin?: unknown,
 *   parentOrigin?: unknown,
 * }} opts
 * @returns {
 *   | { ok: true, host: string }
 *   | { ok: false, code: 'origin_required' | 'club_domain_unresolved' }
 * }
 */
function resolveClubDomainFromOrigin(opts) {
  const originHost = hostFromOriginHeader(opts && opts.origin);
  if (originHost == null) {
    return { ok: false, code: 'origin_required' };
  }

  if (!isEmbedFrameHost(originHost)) {
    return { ok: true, host: originHost };
  }

  const patternId = matchEmbedPatternId(originHost);
  if (patternId !== 'wix-filesusr') {
    // Known pattern list entry without a decoder yet → refuse
    return { ok: false, code: 'club_domain_unresolved' };
  }

  const hostnameOnly = originHost.split(':')[0];
  const suffix = '.filesusr.com';
  if (!hostnameOnly.endsWith(suffix) && hostnameOnly !== 'filesusr.com') {
    return { ok: false, code: 'club_domain_unresolved' };
  }
  const label =
    hostnameOnly === 'filesusr.com'
      ? ''
      : hostnameOnly.slice(0, -suffix.length);
  if (!label || label.includes('.')) {
    return { ok: false, code: 'club_domain_unresolved' };
  }

  const parentHost = hostFromOriginHeader(opts && opts.parentOrigin);
  if (parentHost != null) {
    if (isEmbedFrameHost(parentHost)) {
      return { ok: false, code: 'club_domain_unresolved' };
    }
    const parentLabel = encodeWixFilesusrLabel(parentHost);
    if (parentLabel === label) {
      // Consistent parent wins (handles literal hyphens in club domain)
      if (isEmbedFrameHost(parentHost)) {
        return { ok: false, code: 'club_domain_unresolved' };
      }
      return { ok: true, host: parentHost };
    }
    // Parent present but inconsistent with frame → refuse (do not guess)
    return { ok: false, code: 'club_domain_unresolved' };
  }

  const naive = decodeWixFilesusrLabelNaive(label);
  if (naive == null) {
    return { ok: false, code: 'club_domain_unresolved' };
  }
  // Round-trip check (encode must recreate the frame label)
  if (encodeWixFilesusrLabel(naive) !== label) {
    return { ok: false, code: 'club_domain_unresolved' };
  }
  if (isEmbedFrameHost(naive)) {
    return { ok: false, code: 'club_domain_unresolved' };
  }
  return { ok: true, host: naive };
}

/**
 * Require a parseable Origin hostname, resolving embed frames to club domain.
 * Ignores any query host. Optional parentOrigin (X-Parent-Origin) disambiguates.
 * @param {unknown} originHeader
 * @param {unknown} [parentOriginHeader]
 * @returns {
 *   | { ok: true, host: string }
 *   | { ok: false, code: 'origin_required' | 'club_domain_unresolved' }
 * }
 */
function requireHostFromOrigin(originHeader, parentOriginHeader) {
  return resolveClubDomainFromOrigin({
    origin: originHeader,
    parentOrigin: parentOriginHeader,
  });
}

module.exports = {
  hostFromOriginHeader,
  requireHostFromOrigin,
  resolveClubDomainFromOrigin,
  encodeWixFilesusrLabel,
  decodeWixFilesusrLabelNaive,
  isEmbedFrameHost,
};
