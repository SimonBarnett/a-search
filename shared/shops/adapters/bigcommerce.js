'use strict';

/**
 * FR-245: BigCommerce single-click app OAuth (non-expiring store token).
 * Auth callback exchanges code; Load/Uninstall use signed_payload_jwt (HS256).
 */

const crypto = require('node:crypto');

const DEFAULT_AUTHORIZE =
  'https://login.bigcommerce.com/deep-links/install';
const DEFAULT_TOKEN_URL = 'https://login.bigcommerce.com/oauth2/token';
const DEFAULT_API_BASE = 'https://api.bigcommerce.com';
const DEFAULT_CALLBACK =
  'https://api.smartcatalogue.uk/merchant/shops/callback/bigcommerce';
const SCOPES = 'store_v2_products_read_only store_v2_information_read_only';

/**
 * @param {string} s
 */
function b64urlToBuf(s) {
  const pad = '='.repeat((4 - (String(s).length % 4)) % 4);
  return Buffer.from(
    String(s).replace(/-/g, '+').replace(/_/g, '/') + pad,
    'base64',
  );
}

/**
 * @param {Buffer} buf
 */
function bufToB64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Verify BigCommerce signed_payload_jwt (HS256) with client secret.
 * @param {string} token
 * @param {string} clientSecret
 * @param {{ expectedAud?: string }} [opts]
 * @returns {object|null} payload or null
 */
function verifySignedPayloadJwt(token, clientSecret, opts) {
  const secret = String(clientSecret || '');
  const raw = String(token || '').trim();
  if (!secret || !raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [h64, p64, s64] = parts;
  const data = `${h64}.${p64}`;
  const expected = crypto.createHmac('sha256', secret).update(data).digest();
  let actual;
  try {
    actual = b64urlToBuf(s64);
  } catch {
    return null;
  }
  if (actual.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(expected, actual)) return null;
  } catch {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(b64urlToBuf(p64).toString('utf8'));
  } catch {
    return null;
  }
  if (opts && opts.expectedAud) {
    const aud = payload.aud;
    const want = String(opts.expectedAud);
    const ok = Array.isArray(aud)
      ? aud.map(String).includes(want)
      : String(aud || '') === want;
    if (!ok) return null;
  }
  return payload;
}

/**
 * Test helper: mint a signed_payload_jwt.
 * @param {object} payload
 * @param {string} secret
 */
function signPayloadJwt(payload, secret) {
  const header = bufToB64url(
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'utf8'),
  );
  const body = bufToB64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const data = `${header}.${body}`;
  const sig = bufToB64url(
    crypto.createHmac('sha256', String(secret)).update(data).digest(),
  );
  return `${data}.${sig}`;
}

/**
 * @param {string} context e.g. stores/abc123
 */
function storeHashFromContext(context) {
  const c = String(context || '').trim();
  const m = c.match(/^stores\/([a-zA-Z0-9_-]+)$/);
  return m ? m[1] : c.replace(/^stores\//, '') || '';
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
    const err = new Error('bigcommerce_app_credentials_missing');
    err.code = 'bigcommerce_app_credentials_missing';
    throw err;
  }
  const state = String(ctx.state || '');
  if (!state) {
    const err = new Error('state_required');
    err.code = 'state_required';
    throw err;
  }
  const base = String(ctx.authorizeUrl || DEFAULT_AUTHORIZE).replace(/\/$/, '');
  const params = new URLSearchParams({
    context: 'app',
    state,
  });
  // Draft / marketplace install deep link with our state nonce.
  const redirectUrl = `${base}/${encodeURIComponent(clientId)}?${params}`;
  return {
    redirectUrl,
    loginRequired: true,
    callbackUrl: String(ctx.callbackBaseUrl || DEFAULT_CALLBACK),
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
    const err = new Error('bigcommerce_app_credentials_missing');
    err.code = 'bigcommerce_app_credentials_missing';
    throw err;
  }

  const code = String(flat.code || '').trim();
  const context = String(flat.context || '').trim();
  const scope = String(flat.scope || SCOPES).trim();
  if (!code) {
    const err = new Error('code_required');
    err.code = 'code_required';
    throw err;
  }
  if (!context) {
    const err = new Error('context_required');
    err.code = 'context_required';
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
  const tokenUrl = String(nonce.tokenUrl || DEFAULT_TOKEN_URL);

  const tokenRes = await httpRequest({
    method: 'POST',
    url: tokenUrl,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      scope,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      context,
    }),
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

  const storeHash = storeHashFromContext(
    tokenBody.context || context,
  );
  if (!storeHash) {
    const err = new Error('store_hash_required');
    err.code = 'store_hash_required';
    throw err;
  }

  const store = await fetchStoreProfile(httpRequest, storeHash, accessToken, nonce.apiBase);
  const shopDomain = String(
    store.domain || store.secure_url || `${storeHash}.mybigcommerce.com`,
  )
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  const displayName = String(store.name || storeDomain || storeHash);
  const currency = store.currency ? String(store.currency) : null;

  const secretRef = `vault:bigcommerce:${storeHash}`;
  const nowMs = nonce.nowMs != null ? Number(nonce.nowMs) : Date.now();
  if (nonce.vault && typeof nonce.vault.put === 'function') {
    nonce.vault.put(secretRef, {
      kind: 'bigcommerce_oauth',
      authMethod: 'oauth',
      storeHash,
      shopDomain,
      accessToken,
      accessTokenExpiresAt: null,
      scope: String(tokenBody.scope || scope),
      context: `stores/${storeHash}`,
      userEmail:
        tokenBody.user && tokenBody.user.email
          ? String(tokenBody.user.email)
          : null,
      currency,
      storedAt: nowMs,
    });
  }

  return {
    providerShopId: storeHash,
    shopDomain,
    displayName,
    scopes: String(tokenBody.scope || scope)
      .split(/[,\s]+/)
      .filter(Boolean),
    credentials: { secretRef },
    authMethod: 'oauth',
  };
}

/**
 * @param {Function} httpRequest
 * @param {string} storeHash
 * @param {string} accessToken
 * @param {string} [apiBase]
 */
async function fetchStoreProfile(httpRequest, storeHash, accessToken, apiBase) {
  const base = String(apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
  const res = await httpRequest({
    method: 'GET',
    url: `${base}/stores/${storeHash}/v2/store`,
    headers: {
      'X-Auth-Token': accessToken,
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
  DEFAULT_TOKEN_URL,
  DEFAULT_API_BASE,
  DEFAULT_CALLBACK,
  SCOPES,
  startConnect,
  completeConnect,
  verifySignedPayloadJwt,
  signPayloadJwt,
  storeHashFromContext,
  fetchStoreProfile,
  revoke,
};
