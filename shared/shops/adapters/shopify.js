'use strict';

/**
 * FR-236: Shopify OAuth app-install adapter (offline Admin API token).
 * Pasting API keys is not supported. HMAC verified on callback.
 */

const crypto = require('node:crypto');

const MYSHOPIFY_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const SCOPES = 'read_products,read_inventory';

/**
 * @param {string} domain
 * @returns {string}
 */
function normalizeShopDomain(domain) {
  let raw = String(domain || '')
    .trim()
    .toLowerCase();
  raw = raw.replace(/^https?:\/\//, '');
  raw = raw.split('/')[0];
  return raw;
}

/**
 * @param {string} domain
 */
function assertMyshopifyDomain(domain) {
  const host = normalizeShopDomain(domain);
  if (!MYSHOPIFY_RE.test(host)) {
    const err = new Error('invalid_shop_domain');
    err.code = 'invalid_shop_domain';
    throw err;
  }
  return host;
}

/**
 * Shopify OAuth/query HMAC (hex). Removes hmac (+ signature) then sorts.
 * @param {Record<string, string>} query
 * @param {string} secret
 */
function verifyShopifyHmac(query, secret) {
  const q = { ...(query || {}) };
  const hmac = q.hmac != null ? String(q.hmac) : '';
  delete q.hmac;
  delete q.signature;
  if (!hmac || !secret) return false;
  const message = Object.keys(q)
    .sort()
    .map((k) => `${k}=${Array.isArray(q[k]) ? q[k].join(',') : String(q[k])}`)
    .join('&');
  const digest = crypto
    .createHmac('sha256', String(secret))
    .update(message)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest, 'utf8'),
      Buffer.from(String(hmac), 'utf8'),
    );
  } catch {
    return false;
  }
}

/**
 * Webhook HMAC: base64 of raw body with app secret.
 * @param {string|Buffer} rawBody
 * @param {string} headerHmac
 * @param {string} secret
 */
function verifyShopifyWebhookHmac(rawBody, headerHmac, secret) {
  if (!headerHmac || !secret) return false;
  const digest = crypto
    .createHmac('sha256', String(secret))
    .update(rawBody == null ? '' : rawBody)
    .digest('base64');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest, 'utf8'),
      Buffer.from(String(headerHmac), 'utf8'),
    );
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   shopDomain?: string,
 *   state: string,
 *   callbackBaseUrl?: string,
 *   clientId?: string,
 *   apiKey?: string,
 * }} ctx
 */
async function startConnect(ctx) {
  const shop = assertMyshopifyDomain(ctx.shopDomain || '');
  const clientId = String(ctx.clientId || ctx.apiKey || '').trim();
  if (!clientId) {
    const err = new Error('shopify_app_credentials_missing');
    err.code = 'shopify_app_credentials_missing';
    throw err;
  }
  const callbackBase =
    ctx.callbackBaseUrl ||
    'https://api.smartcatalogue.uk/merchant/shops/callback/shopify';
  const redirectUri = callbackBase.includes('?')
    ? callbackBase
    : callbackBase;
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state: String(ctx.state),
  });
  return {
    redirectUrl: `https://${shop}/admin/oauth/authorize?${params.toString()}`,
    loginRequired: true,
  };
}

/**
 * @param {object} req query/body from callback
 * @param {{
 *   state: string,
 *   shopDomain?: string,
 *   clientId?: string,
 *   clientSecret?: string,
 *   apiKey?: string,
 *   apiSecret?: string,
 *   httpRequest?: Function,
 *   vault?: { put: Function },
 *   nowMs?: number,
 * }} nonce
 */
async function completeConnect(req, nonce) {
  const q = (req && (req.query || req.queryStringParameters || req)) || {};
  const secret = String(
    (nonce && (nonce.clientSecret || nonce.apiSecret)) || '',
  ).trim();
  const clientId = String(
    (nonce && (nonce.clientId || nonce.apiKey)) || '',
  ).trim();
  if (!secret || !clientId) {
    const err = new Error('shopify_app_credentials_missing');
    err.code = 'shopify_app_credentials_missing';
    throw err;
  }

  /** @type {Record<string, string>} */
  const flat = {};
  for (const [k, v] of Object.entries(q)) {
    if (v == null) continue;
    flat[String(k)] = Array.isArray(v) ? String(v[0]) : String(v);
  }

  if (!verifyShopifyHmac(flat, secret)) {
    const err = new Error('invalid_hmac');
    err.code = 'invalid_hmac';
    throw err;
  }

  const shop = assertMyshopifyDomain(flat.shop || (nonce && nonce.shopDomain) || '');
  const code = String(flat.code || '').trim();
  if (!code) {
    const err = new Error('code_required');
    err.code = 'code_required';
    throw err;
  }

  const httpRequest =
    typeof nonce.httpRequest === 'function'
      ? nonce.httpRequest
      : async () => {
          throw new Error('httpRequest_required');
        };

  const tokenRes = await httpRequest({
    method: 'POST',
    url: `https://${shop}/admin/oauth/access_token`,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: secret,
      code,
    }),
  });
  const tokenStatus = Number(tokenRes && tokenRes.statusCode) || 0;
  const tokenBody =
    tokenRes && tokenRes.body && typeof tokenRes.body === 'object'
      ? tokenRes.body
      : (() => {
          try {
            return JSON.parse(String((tokenRes && tokenRes.body) || '{}'));
          } catch {
            return {};
          }
        })();
  if (tokenStatus < 200 || tokenStatus >= 300 || !tokenBody.access_token) {
    const err = new Error('token_exchange_failed');
    err.code = 'token_exchange_failed';
    throw err;
  }
  const accessToken = String(tokenBody.access_token);
  const scopeStr = String(tokenBody.scope || SCOPES);

  // Shop info (name / primary domain / currency) — injectable HTTP.
  let displayName = shop;
  let currency = null;
  try {
    const shopRes = await httpRequest({
      method: 'GET',
      url: `https://${shop}/admin/api/2024-10/shop.json`,
      headers: {
        'X-Shopify-Access-Token': accessToken,
        accept: 'application/json',
      },
    });
    const shopJson =
      shopRes && shopRes.body && typeof shopRes.body === 'object'
        ? shopRes.body
        : JSON.parse(String((shopRes && shopRes.body) || '{}'));
    if (shopJson.shop && shopJson.shop.name) {
      displayName = String(shopJson.shop.name);
    }
    if (shopJson.shop && shopJson.shop.currency) {
      currency = String(shopJson.shop.currency);
    }
  } catch {
    // Shop info is best-effort; token is enough for pending_payment.
  }

  const providerShopId = shop;
  const secretRef = `vault:shopify:${providerShopId}`;
  if (nonce.vault && typeof nonce.vault.put === 'function') {
    nonce.vault.put(secretRef, {
      kind: 'shopify_offline',
      shopDomain: shop,
      accessToken,
      scope: scopeStr,
      currency,
      storedAt: nonce.nowMs != null ? Number(nonce.nowMs) : Date.now(),
    });
  }

  return {
    providerShopId,
    shopDomain: shop,
    displayName,
    scopes: scopeStr.split(',').map((s) => s.trim()).filter(Boolean),
    credentials: { secretRef },
  };
}

async function verifyWebhook(req, opts) {
  const secret = String((opts && opts.clientSecret) || (opts && opts.apiSecret) || '');
  const header =
    (req && req.headers && (req.headers['x-shopify-hmac-sha256'] || req.headers['X-Shopify-Hmac-Sha256'])) ||
    '';
  const raw = (req && (req.rawBody != null ? req.rawBody : req.body)) || '';
  return verifyShopifyWebhookHmac(raw, String(header), secret);
}

async function revoke() {
  return { revoked: true };
}

module.exports = {
  MYSHOPIFY_RE,
  SCOPES,
  normalizeShopDomain,
  assertMyshopifyDomain,
  verifyShopifyHmac,
  verifyShopifyWebhookHmac,
  startConnect,
  completeConnect,
  verifyWebhook,
  revoke,
};
