'use strict';

/**
 * FR-246: Ecwid (Lightspeed E-Series) external app OAuth.
 * Token: POST /api/oauth/token/{store_id} form body (non-expiring secret token).
 * Webhook: X-Ecwid-Webhook-Signature = Base64(HMAC-SHA256(client_secret, eventCreated.eventId)).
 */

const crypto = require('node:crypto');

const DEFAULT_AUTHORIZE = 'https://my.ecwid.com/api/oauth/authorize';
const DEFAULT_TOKEN_BASE = 'https://my.ecwid.com/api/oauth/token';
const DEFAULT_API_BASE = 'https://app.ecwid.com/api/v3';
const DEFAULT_CALLBACK =
  'https://api.smartcatalogue.uk/merchant/shops/callback/ecwid';
const SCOPES = 'read_store_profile read_catalog';

/**
 * @param {string} eventCreated
 * @param {string} eventId
 * @param {string} clientSecret
 * @returns {string} base64 HMAC
 */
function signWebhookPayload(eventCreated, eventId, clientSecret) {
  const data = `${String(eventCreated)}.${String(eventId)}`;
  return crypto
    .createHmac('sha256', String(clientSecret || ''))
    .update(data, 'utf8')
    .digest('base64');
}

/**
 * @param {string} signatureHeader
 * @param {{ eventCreated?: string|number, eventId?: string }} body
 * @param {string} clientSecret
 */
function verifyWebhookSignature(signatureHeader, body, clientSecret) {
  const want = String(signatureHeader || '').trim();
  const secret = String(clientSecret || '');
  if (!want || !secret || !body) return false;
  const eventCreated =
    body.eventCreated != null ? String(body.eventCreated) : '';
  const eventId = body.eventId != null ? String(body.eventId) : '';
  if (!eventCreated || !eventId) return false;
  const expected = signWebhookPayload(eventCreated, eventId, secret);
  const a = Buffer.from(want);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   state: string,
 *   callbackBaseUrl?: string,
 *   clientId?: string,
 *   apiKey?: string,
 *   authorizeUrl?: string,
 * }} ctx
 */
async function startConnect(ctx) {
  const clientId = String(ctx.clientId || ctx.apiKey || '').trim();
  if (!clientId) {
    const err = new Error('ecwid_app_credentials_missing');
    err.code = 'ecwid_app_credentials_missing';
    throw err;
  }
  const state = String(ctx.state || '');
  if (!state) {
    const err = new Error('state_required');
    err.code = 'state_required';
    throw err;
  }
  const redirectUri = String(ctx.callbackBaseUrl || DEFAULT_CALLBACK).trim();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    state,
  });
  const base = String(ctx.authorizeUrl || DEFAULT_AUTHORIZE).replace(/\/$/, '');
  return {
    redirectUrl: `${base}?${params.toString()}`,
    loginRequired: true,
    callbackUrl: redirectUri,
    scopes: SCOPES.split(/\s+/).filter(Boolean),
  };
}

/**
 * @param {object} req
 * @param {object} nonce
 */
async function completeConnect(req, nonce) {
  const q =
    (req && (req.query || req.queryStringParameters || req.body || req)) || {};
  /** @type {Record<string, string>} */
  const flat = {};
  for (const [k, v] of Object.entries(q)) {
    if (v == null) continue;
    flat[String(k)] = Array.isArray(v) ? String(v[0]) : String(v);
  }

  const clientId = String(
    (nonce && (nonce.clientId || nonce.apiKey)) || '',
  ).trim();
  const clientSecret = String(
    (nonce && (nonce.clientSecret || nonce.apiSecret)) || '',
  ).trim();
  if (!clientId || !clientSecret) {
    const err = new Error('ecwid_app_credentials_missing');
    err.code = 'ecwid_app_credentials_missing';
    throw err;
  }

  const code = String(flat.code || '').trim();
  const storeId = String(flat.store_id || flat.storeId || '').trim();
  if (!code) {
    const err = new Error('code_required');
    err.code = 'code_required';
    throw err;
  }
  if (!storeId) {
    const err = new Error('store_id_required');
    err.code = 'store_id_required';
    throw err;
  }

  const httpRequest =
    typeof nonce.httpRequest === 'function'
      ? nonce.httpRequest
      : async () => {
          throw new Error('httpRequest_required');
        };

  const redirectUri = String(
    nonce.redirectUri || nonce.callbackBaseUrl || DEFAULT_CALLBACK,
  ).trim();
  const tokenBase = String(nonce.tokenBase || DEFAULT_TOKEN_BASE).replace(
    /\/$/,
    '',
  );
  const tokenUrl = `${tokenBase}/${encodeURIComponent(storeId)}`;

  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const tokenRes = await httpRequest({
    method: 'POST',
    url: tokenUrl,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: form.toString(),
  });
  const tokenBody = parseBody(tokenRes);
  const accessToken = tokenBody.access_token
    ? String(tokenBody.access_token)
    : '';
  if (!accessToken) {
    const err = new Error('token_exchange_failed');
    err.code = 'token_exchange_failed';
    throw err;
  }
  // Ignore public_token; store only the secret token.
  const resolvedStoreId = String(tokenBody.store_id || storeId);

  const profile = await fetchStoreProfile(
    httpRequest,
    resolvedStoreId,
    accessToken,
    nonce.apiBase,
  );
  const shopDomain = String(
    (profile.generalInfo && profile.generalInfo.storeUrl) ||
      (profile.generalInfo && profile.generalInfo.starterSite && profile.generalInfo.starterSite.ecwidSubdomain
        ? `${profile.generalInfo.starterSite.ecwidSubdomain}.ecwid.com`
        : '') ||
      `store${resolvedStoreId}.ecwid.com`,
  )
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  const displayName = String(
    (profile.account && profile.account.accountName) ||
      (profile.settings && profile.settings.storeName) ||
      shopDomain ||
      resolvedStoreId,
  );
  const currency =
    profile.formatsAndUnits && profile.formatsAndUnits.currency
      ? String(profile.formatsAndUnits.currency)
      : null;

  const secretRef = `vault:ecwid:${resolvedStoreId}`;
  const nowMs = nonce.nowMs != null ? Number(nonce.nowMs) : Date.now();
  if (nonce.vault && typeof nonce.vault.put === 'function') {
    nonce.vault.put(secretRef, {
      kind: 'ecwid_oauth',
      authMethod: 'oauth',
      storeId: resolvedStoreId,
      shopDomain,
      accessToken,
      accessTokenExpiresAt: null,
      scope: String(tokenBody.scope || SCOPES),
      currency,
      storedAt: nowMs,
    });
  }

  return {
    providerShopId: resolvedStoreId,
    shopDomain,
    displayName,
    scopes: String(tokenBody.scope || SCOPES)
      .split(/[,\s]+/)
      .filter(Boolean),
    credentials: { secretRef },
    authMethod: 'oauth',
  };
}

/**
 * @param {Function} httpRequest
 * @param {string} storeId
 * @param {string} accessToken
 * @param {string} [apiBase]
 */
async function fetchStoreProfile(httpRequest, storeId, accessToken, apiBase) {
  const base = String(apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
  const res = await httpRequest({
    method: 'GET',
    url: `${base}/${encodeURIComponent(storeId)}/profile`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  const body = parseBody(res);
  return body && typeof body === 'object' ? body : {};
}

function parseBody(res) {
  if (res && res.body && typeof res.body === 'object') return res.body;
  try {
    return JSON.parse(String((res && res.body) || '{}'));
  } catch {
    return {};
  }
}

async function revoke() {
  return { revoked: true };
}

module.exports = {
  DEFAULT_AUTHORIZE,
  DEFAULT_TOKEN_BASE,
  DEFAULT_API_BASE,
  DEFAULT_CALLBACK,
  SCOPES,
  startConnect,
  completeConnect,
  signWebhookPayload,
  verifyWebhookSignature,
  fetchStoreProfile,
  revoke,
};
