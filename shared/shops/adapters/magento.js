'use strict';

/**
 * FR-243: Magento / Adobe Commerce Integration OAuth 1.0a connect.
 * Activation POST holds consumer creds; identity bind + token exchange completes Shop.
 */

const { URL } = require('node:url');
const { signOAuth1 } = require('../../../providers/local/magento/src/oauth1');

const PRIVATE_HOST_RE = /^(localhost|127\.0\.0\.1|::1|0\.0\.0\.0)$/i;
const PRIVATE_IP_RE =
  /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/;

const DEFAULT_CALLBACK =
  'https://api.smartcatalogue.uk/merchant/shops/callback/magento';
const DEFAULT_IDENTITY =
  'https://smartcatalogue.uk/merchant/shops/magento/identity';
const ACTIVATION_TTL_MS = 10 * 60 * 1000;

/** @type {Map<string, { storeBaseUrl: string, oauthVerifier: string, consumerKey: string, consumerSecret: string, expiresAt: number }>} */
const pendingByConsumerKey = new Map();

function clearPendingActivations() {
  pendingByConsumerKey.clear();
}

/**
 * @param {string} domain
 * @returns {string} https origin without trailing slash
 */
function normalizeShopOrigin(domain) {
  let raw = String(domain || '').trim();
  if (!raw) {
    const err = new Error('invalid_shop_domain');
    err.code = 'invalid_shop_domain';
    throw err;
  }
  if (/^http:\/\//i.test(raw)) {
    const err = new Error('invalid_shop_domain');
    err.code = 'invalid_shop_domain';
    throw err;
  }
  if (!/^https:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }
  let u;
  try {
    u = new URL(raw);
  } catch {
    const err = new Error('invalid_shop_domain');
    err.code = 'invalid_shop_domain';
    throw err;
  }
  if (u.protocol !== 'https:') {
    const err = new Error('invalid_shop_domain');
    err.code = 'invalid_shop_domain';
    throw err;
  }
  const host = u.hostname.toLowerCase();
  if (!host || PRIVATE_HOST_RE.test(host) || PRIVATE_IP_RE.test(host)) {
    const err = new Error('invalid_shop_domain');
    err.code = 'invalid_shop_domain';
    throw err;
  }
  if (
    host.includes(':') &&
    (host === '::1' || host.startsWith('fc') || host.startsWith('fd'))
  ) {
    const err = new Error('invalid_shop_domain');
    err.code = 'invalid_shop_domain';
    throw err;
  }
  const port = u.port && u.port !== '443' ? `:${u.port}` : '';
  return `https://${host}${port}`;
}

/**
 * Wizard start: mint FR-216 state externally; return Integration URLs.
 * @param {{
 *   state: string,
 *   callbackBaseUrl?: string,
 *   identityBaseUrl?: string,
 * }} ctx
 */
async function startConnect(ctx) {
  const state = String(ctx.state || '');
  if (!state) {
    const err = new Error('state_required');
    err.code = 'state_required';
    throw err;
  }
  const callbackUrl = String(ctx.callbackBaseUrl || DEFAULT_CALLBACK).trim();
  const identityBase = String(ctx.identityBaseUrl || DEFAULT_IDENTITY).replace(
    /\/$/,
    '',
  );
  const identityLinkUrl = `${identityBase}?state=${encodeURIComponent(state)}`;
  return {
    redirectUrl: identityLinkUrl,
    loginRequired: true,
    callbackUrl,
    identityLinkUrl,
    instructions: {
      adminPath: 'System -> Extensions -> Integrations -> Add New Integration',
      callbackUrl,
      identityLinkUrl,
      resources: ['Catalog -> Inventory -> Products (read)', 'Stores -> Settings (read)'],
    },
  };
}

/**
 * Magento Activate POST (no FR-216 state in body). Hold 10 minutes.
 * @param {object} body
 * @param {{ nowMs?: number }} [opts]
 */
function receiveActivation(body, opts) {
  const b = body || {};
  const consumerKey = String(
    b.oauth_consumer_key || b.oauthConsumerKey || '',
  ).trim();
  const consumerSecret = String(
    b.oauth_consumer_secret || b.oauthConsumerSecret || '',
  ).trim();
  const oauthVerifier = String(
    b.oauth_verifier || b.oauthVerifier || '',
  ).trim();
  const storeBaseUrlRaw = String(
    b.store_base_url || b.storeBaseUrl || '',
  ).trim();
  if (!consumerKey || !consumerSecret || !oauthVerifier || !storeBaseUrlRaw) {
    const err = new Error('activation_incomplete');
    err.code = 'activation_incomplete';
    throw err;
  }
  // SSRF: validate before any outbound call (activation itself makes none).
  const storeBaseUrl = normalizeShopOrigin(storeBaseUrlRaw);
  const now = opts && opts.nowMs != null ? Number(opts.nowMs) : Date.now();
  pendingByConsumerKey.set(consumerKey, {
    storeBaseUrl,
    oauthVerifier,
    consumerKey,
    consumerSecret,
    expiresAt: now + ACTIVATION_TTL_MS,
  });
  return { ok: true, consumerKey, storeBaseUrl };
}

/**
 * Identity bind + token exchange + storeConfigs verify.
 * Used as FR-216 completeConnect when req carries oauth_consumer_key.
 * @param {object} req
 * @param {object} nonce
 */
async function completeConnect(req, nonce) {
  const q = (req && (req.query || req.queryStringParameters || req.body || req)) || {};
  /** @type {Record<string, string>} */
  const flat = {};
  for (const [k, v] of Object.entries(q)) {
    if (v == null) continue;
    flat[String(k)] = Array.isArray(v) ? String(v[0]) : String(v);
  }
  const consumerKey = String(
    flat.oauth_consumer_key || flat.oauthConsumerKey || '',
  ).trim();
  if (!consumerKey) {
    const err = new Error('oauth_consumer_key_required');
    err.code = 'oauth_consumer_key_required';
    throw err;
  }

  const now = nonce.nowMs != null ? Number(nonce.nowMs) : Date.now();
  const pending = pendingByConsumerKey.get(consumerKey);
  if (!pending) {
    const err = new Error('unknown_consumer_key');
    err.code = 'unknown_consumer_key';
    throw err;
  }
  if (pending.expiresAt < now) {
    pendingByConsumerKey.delete(consumerKey);
    const err = new Error('activation_expired');
    err.code = 'activation_expired';
    throw err;
  }

  const httpRequest =
    typeof nonce.httpRequest === 'function'
      ? nonce.httpRequest
      : async () => {
          throw new Error('httpRequest_required');
        };

  const origin = pending.storeBaseUrl;
  // Request token
  const reqTokenUrl = `${origin}/oauth/token/request`;
  const reqSigned = signOAuth1({
    method: 'POST',
    url: reqTokenUrl,
    consumerKey: pending.consumerKey,
    consumerSecret: pending.consumerSecret,
    nonce: nonce.oauthNonce || 'nonce_req',
    timestamp: nonce.oauthTimestamp || Math.floor(now / 1000),
  });
  const reqTokRes = await httpRequest({
    method: 'POST',
    url: reqTokenUrl,
    headers: {
      Authorization: reqSigned.authorization,
      Accept: 'application/json',
    },
  });
  const reqTok = parseTokenBody(reqTokRes);
  if (!reqTok.oauth_token || !reqTok.oauth_token_secret) {
    const err = new Error('request_token_failed');
    err.code = 'request_token_failed';
    throw err;
  }

  // Access token
  const accessUrl = `${origin}/oauth/token/access`;
  const accessSigned = signOAuth1({
    method: 'POST',
    url: accessUrl,
    consumerKey: pending.consumerKey,
    consumerSecret: pending.consumerSecret,
    token: reqTok.oauth_token,
    tokenSecret: reqTok.oauth_token_secret,
    params: { oauth_verifier: pending.oauthVerifier },
    nonce: nonce.oauthNonce2 || 'nonce_access',
    timestamp: nonce.oauthTimestamp2 || Math.floor(now / 1000) + 1,
  });
  const accessRes = await httpRequest({
    method: 'POST',
    url: accessUrl,
    headers: {
      Authorization: accessSigned.authorization,
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      oauth_verifier: pending.oauthVerifier,
    }).toString(),
  });
  const accessTok = parseTokenBody(accessRes);
  if (!accessTok.oauth_token || !accessTok.oauth_token_secret) {
    const err = new Error('access_token_failed');
    err.code = 'access_token_failed';
    throw err;
  }

  // Verify storeConfigs
  const configsUrl = `${origin}/rest/V1/store/storeConfigs`;
  const cfgSigned = signOAuth1({
    method: 'GET',
    url: configsUrl,
    consumerKey: pending.consumerKey,
    consumerSecret: pending.consumerSecret,
    token: accessTok.oauth_token,
    tokenSecret: accessTok.oauth_token_secret,
    nonce: nonce.oauthNonce3 || 'nonce_cfg',
    timestamp: nonce.oauthTimestamp3 || Math.floor(now / 1000) + 2,
  });
  const cfgRes = await httpRequest({
    method: 'GET',
    url: configsUrl,
    headers: {
      Authorization: cfgSigned.authorization,
      Accept: 'application/json',
    },
  });
  const cfgStatus = Number(cfgRes && cfgRes.statusCode) || 0;
  if (cfgStatus === 401) {
    const err = new Error('magento_unauthorized');
    err.code = 'magento_unauthorized';
    throw err;
  }
  if (cfgStatus < 200 || cfgStatus >= 300) {
    const err = new Error('store_configs_failed');
    err.code = 'store_configs_failed';
    throw err;
  }
  const configs = parseJsonBody(cfgRes);
  const first = Array.isArray(configs) ? configs[0] : configs;
  const host = new URL(origin).hostname;
  const baseUrl =
    (first && (first.base_url || first.secure_base_url)) || origin + '/';
  const currency =
    (first && (first.base_currency_code || first.default_display_currency_code)) ||
    null;
  const locale = (first && first.locale) || null;
  const providerShopId = host;
  const secretRef = `vault:magento:${providerShopId}`;

  if (nonce.vault && typeof nonce.vault.put === 'function') {
    nonce.vault.put(secretRef, {
      kind: 'magento_oauth1',
      authMethod: 'oauth1',
      storeBaseUrl: origin,
      shopDomain: host,
      consumerKey: pending.consumerKey,
      consumerSecret: pending.consumerSecret,
      accessToken: accessTok.oauth_token,
      accessTokenSecret: accessTok.oauth_token_secret,
      currency,
      locale,
      storedAt: now,
    });
  }

  pendingByConsumerKey.delete(consumerKey);

  return {
    providerShopId,
    shopDomain: host,
    displayName: host,
    scopes: ['Catalog.Products.read', 'Stores.Settings.read'],
    credentials: { secretRef },
    successCallBack: flat.success_call_back || flat.successCallBack || null,
    baseUrl,
  };
}

function parseTokenBody(res) {
  const raw =
    res && res.body != null
      ? typeof res.body === 'string'
        ? res.body
        : typeof res.body === 'object'
          ? new URLSearchParams(
              Object.entries(res.body).map(([k, v]) => [k, String(v)]),
            ).toString()
          : String(res.body)
      : '';
  if (res && res.body && typeof res.body === 'object' && res.body.oauth_token) {
    return {
      oauth_token: String(res.body.oauth_token),
      oauth_token_secret: String(res.body.oauth_token_secret || ''),
    };
  }
  const params = new URLSearchParams(raw);
  return {
    oauth_token: params.get('oauth_token') || '',
    oauth_token_secret: params.get('oauth_token_secret') || '',
  };
}

function parseJsonBody(res) {
  if (res && res.body && typeof res.body === 'object') return res.body;
  try {
    return JSON.parse(String((res && res.body) || '[]'));
  } catch {
    return [];
  }
}

async function revoke() {
  return { revoked: true };
}

module.exports = {
  PRIVATE_HOST_RE,
  PRIVATE_IP_RE,
  ACTIVATION_TTL_MS,
  DEFAULT_CALLBACK,
  DEFAULT_IDENTITY,
  normalizeShopOrigin,
  clearPendingActivations,
  receiveActivation,
  startConnect,
  completeConnect,
  revoke,
  pendingByConsumerKey,
};
