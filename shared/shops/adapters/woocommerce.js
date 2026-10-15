'use strict';

/**
 * FR-238: WooCommerce /wc-auth key generation adapter (read-only REST keys).
 * HTTPS public hosts only (SSRF gate). No uninstall webhook.
 */

const { URL } = require('node:url');

const PRIVATE_HOST_RE =
  /^(localhost|127\.0\.0\.1|::1|0\.0\.0\.0)$/i;
const PRIVATE_IP_RE =
  /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/;

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
  // Block obvious dotted-decimal private forms already covered; also bare IPv6 locals
  if (host.includes(':') && (host === '::1' || host.startsWith('fc') || host.startsWith('fd'))) {
    const err = new Error('invalid_shop_domain');
    err.code = 'invalid_shop_domain';
    throw err;
  }
  const port = u.port && u.port !== '443' ? `:${u.port}` : '';
  return `https://${host}${port}`;
}

/**
 * @param {string} origin
 * @param {Function} httpRequest
 */
async function probeWcApi(origin, httpRequest) {
  const url = `${origin}/wp-json/wc/v3`;
  const res = await httpRequest({
    method: 'GET',
    url,
    headers: { Accept: 'application/json' },
  });
  const status = Number(res && res.statusCode) || 0;
  // Woo returns 401 without keys for /wc/v3 root on many installs; treat
  // 200/401 as "endpoint exists". 404/connection fail = probe failed.
  if (status === 404 || status === 0) {
    const err = new Error('wc_probe_failed');
    err.code = 'wc_probe_failed';
    throw err;
  }
  return true;
}

/**
 * @param {string} origin
 * @param {string} consumerKey
 * @param {string} consumerSecret
 * @param {Function} httpRequest
 */
async function assertReadKeysWork(origin, consumerKey, consumerSecret, httpRequest) {
  const token = Buffer.from(
    `${consumerKey}:${consumerSecret}`,
    'utf8',
  ).toString('base64');
  const url = `${origin}/wp-json/wc/v3/products?per_page=1`;
  const res = await httpRequest({
    method: 'GET',
    url,
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${token}`,
    },
  });
  const status = Number(res && res.statusCode) || 0;
  if (status < 200 || status >= 300) {
    const err = new Error('keys_invalid');
    err.code = 'keys_invalid';
    throw err;
  }
  return true;
}

/**
 * @param {{
 *   shopDomain?: string,
 *   state: string,
 *   callbackBaseUrl?: string,
 *   wizardReturnUrl?: string,
 *   appName?: string,
 *   httpRequest?: Function,
 *   consumerKey?: string,
 *   consumerSecret?: string,
 * }} ctx
 */
async function startConnect(ctx) {
  const origin = normalizeShopOrigin(ctx.shopDomain || '');
  const httpRequest =
    typeof ctx.httpRequest === 'function'
      ? ctx.httpRequest
      : async () => ({ statusCode: 401, body: {} });

  await probeWcApi(origin, httpRequest);

  // Advanced paste path: keys supplied on connect (validated here; shop row
  // created by merchantShops immediate completeConnect).
  if (ctx.consumerKey && ctx.consumerSecret) {
    const key = String(ctx.consumerKey).trim();
    const secret = String(ctx.consumerSecret).trim();
    if (!key || !secret) {
      const err = new Error('keys_required');
      err.code = 'keys_required';
      throw err;
    }
    await assertReadKeysWork(origin, key, secret, httpRequest);
    return {
      redirectUrl: `paste://${new URL(origin).hostname}`,
      loginRequired: false,
      paste: true,
      shopOrigin: origin,
    };
  }

  const callbackBase =
    ctx.callbackBaseUrl ||
    'https://api.smartcatalogue.uk/merchant/shops/callback/woocommerce';
  const returnUrl =
    ctx.wizardReturnUrl ||
    'https://smartcatalogue.uk/wizard/shops/woocommerce-return';
  const appName = String(ctx.appName || 'SmartCatalogue');
  const params = new URLSearchParams({
    app_name: appName,
    scope: 'read',
    user_id: String(ctx.state),
    return_url: returnUrl,
    callback_url: callbackBase,
  });
  return {
    redirectUrl: `${origin}/wc-auth/v1/authorize?${params.toString()}`,
    loginRequired: true,
    shopOrigin: origin,
  };
}

/**
 * Woo POSTs keys to callback_url; user_id is the FR-216 state nonce.
 * @param {object} req
 * @param {object} nonce
 */
async function completeConnect(req, nonce) {
  const body = (req && (req.body || req)) || {};
  const q = (req && (req.query || req.queryStringParameters)) || {};
  const consumerKey = String(
    body.consumer_key || body.consumerKey || q.consumer_key || '',
  ).trim();
  const consumerSecret = String(
    body.consumer_secret || body.consumerSecret || q.consumer_secret || '',
  ).trim();
  const permissions = String(
    body.key_permissions || body.keyPermissions || q.key_permissions || '',
  )
    .trim()
    .toLowerCase();
  const keyId = String(body.key_id || body.keyId || q.key_id || 'wc').trim();

  if (!consumerKey || !consumerSecret) {
    const err = new Error('keys_required');
    err.code = 'keys_required';
    throw err;
  }
  if (permissions && permissions !== 'read') {
    const err = new Error('invalid_key_permissions');
    err.code = 'invalid_key_permissions';
    throw err;
  }
  // When permissions omitted (paste path), treat as read-only after probe.

  const origin = normalizeShopOrigin(
    (nonce && nonce.shopDomain) || body.shopDomain || '',
  );
  const httpRequest =
    typeof nonce.httpRequest === 'function'
      ? nonce.httpRequest
      : async () => {
          throw new Error('httpRequest_required');
        };

  await assertReadKeysWork(origin, consumerKey, consumerSecret, httpRequest);

  const host = new URL(origin).hostname;
  const providerShopId = host;
  const secretRef = `vault:woocommerce:${providerShopId}`;
  if (nonce.vault && typeof nonce.vault.put === 'function') {
    nonce.vault.put(secretRef, {
      kind: 'woocommerce_rest',
      shopDomain: host,
      storeUrl: origin,
      consumerKey,
      consumerSecret,
      keyId,
      keyPermissions: 'read',
      storedAt: nonce.nowMs != null ? Number(nonce.nowMs) : Date.now(),
    });
  }

  return {
    providerShopId,
    shopDomain: host,
    displayName: host,
    scopes: ['read'],
    credentials: { secretRef },
  };
}

async function revoke() {
  return { revoked: true };
}

module.exports = {
  normalizeShopOrigin,
  probeWcApi,
  assertReadKeysWork,
  startConnect,
  completeConnect,
  revoke,
};
