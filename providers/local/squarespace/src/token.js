'use strict';

/**
 * FR-242: Squarespace OAuth token refresh (one-time refresh tokens).
 * Persist the NEW refresh token in the vault BEFORE using the new access token.
 */

const DEFAULT_TOKEN_URL =
  'https://login.squarespace.com/api/1/login/oauth/provider/tokens';
const DEFAULT_KEEPALIVE_DAYS = 5;
const USER_AGENT = 'a-search-squarespace/1.0 (+https://smartcatalogue.uk)';

/**
 * @param {{
 *   vault: { get: Function, put: Function },
 *   secretRef: string,
 *   clientId: string,
 *   clientSecret: string,
 *   httpRequest?: Function,
 *   tokenUrl?: string,
 *   nowMs?: number,
 * }} opts
 * @returns {Promise<{ accessToken: string, refreshToken: string, creds: object }>}
 */
async function refreshAccessToken(opts) {
  const vault = opts.vault;
  const secretRef = String(opts.secretRef || '');
  const clientId = String(opts.clientId || '').trim();
  const clientSecret = String(opts.clientSecret || '').trim();
  if (!vault || !secretRef || !clientId || !clientSecret) {
    const err = new Error('squarespace_token_credentials_missing');
    err.code = 'squarespace_token_credentials_missing';
    throw err;
  }
  const prev = vault.get(secretRef);
  if (!prev || prev.authMethod === 'api_key') {
    const err = new Error('squarespace_refresh_not_applicable');
    err.code = 'squarespace_refresh_not_applicable';
    throw err;
  }
  const oldRefresh = prev.refreshToken ? String(prev.refreshToken) : '';
  if (!oldRefresh) {
    const err = new Error('squarespace_refresh_missing');
    err.code = 'squarespace_refresh_missing';
    throw err;
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
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': USER_AGENT,
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: oldRefresh,
      client_id: clientId,
      client_secret: clientSecret,
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
  const status = Number(res && res.statusCode) || 0;
  if (status === 400 || status === 401 || !body.access_token || !body.refresh_token) {
    const err = new Error('squarespace_refresh_invalid');
    err.code = 'squarespace_refresh_invalid';
    err.httpStatus = status;
    throw err;
  }

  const nowMs = opts.nowMs != null ? Number(opts.nowMs) : Date.now();
  const nextCreds = {
    ...prev,
    kind: 'squarespace_oauth',
    authMethod: 'oauth',
    refreshToken: String(body.refresh_token),
    accessToken: String(body.access_token),
    accessTokenExpiresAt: nowMs + 30 * 60 * 1000,
    refreshTokenStoredAt: nowMs,
    previousRefreshToken: undefined,
  };
  // Atomic persist of NEW refresh token before caller uses access token.
  vault.put(secretRef, nextCreds);
  return {
    accessToken: nextCreds.accessToken,
    refreshToken: nextCreds.refreshToken,
    creds: nextCreds,
  };
}

/**
 * Keep-alive: refresh OAuth shops whose refresh token age >= keepalive days.
 * @param {{
 *   shops: { get: Function, listByMerchant?: Function, transition: Function },
 *   vault: { get: Function, put: Function },
 *   shopIds: string[],
 *   clientId: string,
 *   clientSecret: string,
 *   httpRequest?: Function,
 *   nowMs?: number,
 *   keepaliveDays?: number,
 *   sendNotice?: Function,
 * }} args
 */
async function runSquarespaceKeepAlive(args) {
  const now = args.nowMs != null ? Number(args.nowMs) : Date.now();
  const days =
    args.keepaliveDays != null
      ? Number(args.keepaliveDays)
      : Number(process.env.SQUARESPACE_REFRESH_KEEPALIVE_DAYS || DEFAULT_KEEPALIVE_DAYS);
  const maxAgeMs = Math.max(1, days) * 86400000;
  const results = [];
  for (const shopId of args.shopIds || []) {
    const shop = args.shops.get(shopId);
    if (!shop || shop.provider !== 'squarespace') continue;
    if (shop.status !== 'live' && shop.status !== 'pending_payment') continue;
    const ref = shop.credentialsSecretRef;
    if (!ref) continue;
    const creds = args.vault.get(ref);
    if (!creds || creds.authMethod === 'api_key') continue;
    const storedAt = Number(creds.refreshTokenStoredAt) || 0;
    if (now - storedAt < maxAgeMs) {
      results.push({ shopId, refreshed: false, reason: 'fresh' });
      continue;
    }
    try {
      await refreshAccessToken({
        vault: args.vault,
        secretRef: ref,
        clientId: args.clientId,
        clientSecret: args.clientSecret,
        httpRequest: args.httpRequest,
        nowMs: now,
      });
      results.push({ shopId, refreshed: true });
    } catch (err) {
      if (err && err.code === 'squarespace_refresh_invalid') {
        args.shops.transition(shopId, 'suspended', {
          reason: 'auth',
          nowMs: now,
        });
        if (typeof args.sendNotice === 'function') {
          await args.sendNotice({
            notice: 'reconnect',
            shopId,
            channel: 'sms_email',
            reason: 'squarespace_refresh_expired',
          });
        }
        results.push({ shopId, refreshed: false, reason: 'suspended_auth' });
      } else {
        results.push({
          shopId,
          refreshed: false,
          reason: (err && err.code) || 'error',
        });
      }
    }
  }
  return { ok: true, results };
}

module.exports = {
  DEFAULT_TOKEN_URL,
  DEFAULT_KEEPALIVE_DAYS,
  refreshAccessToken,
  runSquarespaceKeepAlive,
};
