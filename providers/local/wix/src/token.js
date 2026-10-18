'use strict';

/**
 * FR-237: mint short-lived Wix access tokens from instanceId + app credentials.
 * Tokens are cached in memory only for their TTL; never logged.
 */

const DEFAULT_TOKEN_URL = 'https://www.wixapis.com/oauth2/token';
const DEFAULT_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours (Wix docs)
const SKEW_MS = 60 * 1000;

/** @type {Map<string, { accessToken: string, expiresAtMs: number }>} */
const cache = new Map();

/**
 * @param {{
 *   instanceId: string,
 *   appId: string,
 *   appSecret: string,
 *   httpRequest?: Function,
 *   tokenUrl?: string,
 *   nowMs?: number,
 *   ttlMs?: number,
 *   cacheKey?: string,
 * }} opts
 * @returns {Promise<string>} access token (never logged by this helper)
 */
async function getAccessToken(opts) {
  const instanceId = String((opts && opts.instanceId) || '').trim();
  const appId = String((opts && opts.appId) || '').trim();
  const appSecret = String((opts && opts.appSecret) || '').trim();
  if (!instanceId || !appId || !appSecret) {
    const err = new Error('wix_token_credentials_missing');
    err.code = 'wix_token_credentials_missing';
    throw err;
  }
  const now = opts.nowMs != null ? Number(opts.nowMs) : Date.now();
  const key = String(opts.cacheKey || `${appId}:${instanceId}`);
  const hit = cache.get(key);
  if (hit && hit.expiresAtMs - SKEW_MS > now) {
    return hit.accessToken;
  }

  const httpRequest =
    typeof opts.httpRequest === 'function'
      ? opts.httpRequest
      : async () => {
          throw new Error('httpRequest_required');
        };

  const res = await httpRequest({
    method: 'POST',
    url: String(opts.tokenUrl || DEFAULT_TOKEN_URL),
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: appId,
      client_secret: appSecret,
      instance_id: instanceId,
    }),
  });
  const body =
    res && res.body && typeof res.body === 'object'
      ? res.body
      : (() => {
          try {
            return JSON.parse(String((res && res.body) || '{}'));
          } catch {
            return {};
          }
        })();
  const accessToken = body.access_token ? String(body.access_token) : '';
  if (!accessToken) {
    const err = new Error('wix_token_mint_failed');
    err.code = 'wix_token_mint_failed';
    throw err;
  }
  const ttl =
    opts.ttlMs != null
      ? Number(opts.ttlMs)
      : body.expires_in != null
        ? Number(body.expires_in) * 1000
        : DEFAULT_TTL_MS;
  cache.set(key, {
    accessToken,
    expiresAtMs: now + (Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_TTL_MS),
  });
  return accessToken;
}

/** Test helper: clear in-memory cache. */
function clearTokenCache() {
  cache.clear();
}

/**
 * @param {string} [cacheKey]
 * @returns {{ accessToken: string, expiresAtMs: number }|null}
 */
function peekTokenCache(cacheKey) {
  const row = cache.get(String(cacheKey || ''));
  return row ? { ...row } : null;
}

module.exports = {
  DEFAULT_TOKEN_URL,
  DEFAULT_TTL_MS,
  getAccessToken,
  clearTokenCache,
  peekTokenCache,
};
