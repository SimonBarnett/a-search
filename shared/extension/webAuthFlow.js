'use strict';

/**
 * #2078: chrome.identity.launchWebAuthFlow helpers (shared login / FR-229).
 * Pure URL builders + JWT parse (no verify in the extension; entry verifies).
 */

/**
 * @param {{
 *   loginOrigin: string,
 *   redirectUri: string,
 *   intent?: string,
 *   path?: string,
 * }} opts
 */
function buildExtensionLoginUrl(opts) {
  const o = opts || {};
  const origin = String(o.loginOrigin || '').replace(/\/$/, '');
  const redirectUri = String(o.redirectUri || '');
  if (!origin) {
    const err = new Error('login_origin_required');
    err.code = 'login_origin_required';
    throw err;
  }
  if (!redirectUri) {
    const err = new Error('redirect_uri_required');
    err.code = 'redirect_uri_required';
    throw err;
  }
  const path = o.path || '/components-piece/login/';
  const intent = String(o.intent || 'club').trim() || 'club';
  const u = new URL(path, origin.endsWith('/') ? origin : origin + '/');
  u.searchParams.set('extension', '1');
  u.searchParams.set('intent', intent);
  u.searchParams.set('redirect_uri', redirectUri);
  return u.toString();
}

/**
 * Extract Bearer JWT from a chrome.identity redirect URL.
 * Accepts #access_token=, #id_token=, ?access_token=, ?jwt=, #jwt=.
 * @param {string} responseUrl
 * @returns {string|null}
 */
function parseJwtFromRedirectUrl(responseUrl) {
  const raw = String(responseUrl || '');
  if (!raw) return null;
  let hash = '';
  let search = '';
  try {
    const u = new URL(raw);
    hash = u.hash ? u.hash.replace(/^#/, '') : '';
    search = u.search ? u.search.replace(/^\?/, '') : '';
  } catch {
    const hashIdx = raw.indexOf('#');
    const qIdx = raw.indexOf('?');
    if (hashIdx >= 0) hash = raw.slice(hashIdx + 1);
    if (qIdx >= 0) {
      const end = hashIdx >= 0 && hashIdx > qIdx ? hashIdx : raw.length;
      search = raw.slice(qIdx + 1, end);
    }
  }
  const params = new URLSearchParams(hash || search);
  const token =
    params.get('access_token') ||
    params.get('id_token') ||
    params.get('jwt') ||
    params.get('token');
  if (!token || !String(token).includes('.')) return null;
  return String(token);
}

/**
 * Decode JWT payload without verifying signature (UI role chip only).
 * @param {string} jwt
 * @returns {Record<string, unknown>|null}
 */
function decodeJwtPayload(jwt) {
  const parts = String(jwt || '').split('.');
  if (parts.length < 2) return null;
  try {
    const pad = parts[1].length % 4 === 0 ? '' : '='.repeat(4 - (parts[1].length % 4));
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/') + pad;
    const json = Buffer.from(b64, 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Club-only Claim button gate.
 * @param {Record<string, unknown>|null|undefined} payload
 */
function isClubRole(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const role = String(payload.role || payload.intent || '')
    .trim()
    .toLowerCase();
  return role === 'club';
}

/**
 * MRB #2224: login page must only redirect JWTs to chrome.identity URLs.
 * Allow chrome-extension: and https://*.chromiumapp.org/ (getRedirectURL hosts).
 * @param {string} redirectUri
 * @returns {boolean}
 */
function isAllowedExtensionRedirectUri(redirectUri) {
  const raw = String(redirectUri || '').trim();
  if (!raw) return false;
  try {
    const u = new URL(raw);
    if (u.protocol === 'chrome-extension:') return true;
    if (u.protocol === 'https:' && /\.chromiumapp\.org$/i.test(u.hostname)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

module.exports = {
  buildExtensionLoginUrl,
  parseJwtFromRedirectUrl,
  decodeJwtPayload,
  isClubRole,
  isAllowedExtensionRedirectUri,
};
