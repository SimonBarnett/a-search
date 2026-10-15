'use strict';

/**
 * FR-236: POST /webhooks/shop/shopify
 * app/uninstalled -> suspended(uninstalled); privacy webhooks 200 (no PII);
 * shop/redact deletes shop row + vault credentials.
 */

const {
  verifyShopifyWebhookHmac,
} = require('../../shared/shops/adapters/shopify');
const { createShopsRegistry } = require('../../shared/shops/registry');
const { createCredentialsVault } = require('../../shared/shops/vault');

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const defaultShops = createShopsRegistry();
const defaultVault = createCredentialsVault();

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

function headerGet(headers, name) {
  if (!headers || typeof headers !== 'object') return undefined;
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === want) return v;
  }
  return undefined;
}

/**
 * @param {string} method
 * @param {string} path
 */
function matchShopifyWebhookRoute(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '');
  if (m === 'POST' && p === '/webhooks/shop/shopify') {
    return 'POST /webhooks/shop/shopify';
  }
  return null;
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handleShopifyWebhook(event, deps = {}) {
  const secret = String(
    (deps.clientSecret ||
      deps.apiSecret ||
      (deps.env && deps.env.SHOPIFY_API_SECRET_KEY) ||
      process.env.SHOPIFY_API_SECRET_KEY ||
      '') + '',
  ).trim();
  const hmac = headerGet(event && event.headers, 'x-shopify-hmac-sha256');
  const topic = String(
    headerGet(event && event.headers, 'x-shopify-topic') || '',
  ).toLowerCase();
  const shopDomain = String(
    headerGet(event && event.headers, 'x-shopify-shop-domain') || '',
  ).toLowerCase();
  const rawBody =
    event && event.isBase64Encoded
      ? Buffer.from(String(event.body || ''), 'base64')
      : event && event.body != null
        ? Buffer.from(
            typeof event.body === 'string'
              ? event.body
              : JSON.stringify(event.body),
            'utf8',
          )
        : Buffer.alloc(0);

  if (!verifyShopifyWebhookHmac(rawBody, hmac, secret)) {
    return jsonResponse(401, { ok: false, error: 'invalid_hmac' });
  }

  let payload = {};
  try {
    payload = JSON.parse(rawBody.toString('utf8') || '{}');
  } catch {
    payload = {};
  }

  const shops = deps.shops || defaultShops;
  const vault = deps.vault || defaultVault;
  const cancelSubscription =
    typeof deps.cancelSubscription === 'function'
      ? deps.cancelSubscription
      : async () => ({ cancelled: true, stub: true });

  // Privacy webhooks: we hold no customer PII.
  if (
    topic === 'customers/data_request' ||
    topic === 'customers/redact'
  ) {
    return jsonResponse(200, { ok: true });
  }

  if (topic === 'shop/redact') {
    const row = shops.getByProviderShopId('shopify', shopDomain);
    if (row) {
      if (row.credentialsSecretRef) {
        vault.delete(row.credentialsSecretRef);
      }
      shops.deleteByShopId(row.shopId);
    }
    return jsonResponse(200, { ok: true, deleted: Boolean(row) });
  }

  if (topic === 'app/uninstalled') {
    const row =
      shops.getByProviderShopId('shopify', shopDomain) ||
      (payload && payload.domain
        ? shops.getByProviderShopId('shopify', String(payload.domain).toLowerCase())
        : null);
    if (row) {
      shops.updateStatus(row.shopId, 'suspended', 'uninstalled');
      await cancelSubscription({
        shopId: row.shopId,
        reason: 'uninstalled',
      });
    }
    return jsonResponse(200, {
      ok: true,
      status: row ? 'suspended' : 'noop',
    });
  }

  return jsonResponse(200, { ok: true, ignored: true, topic });
}

module.exports = {
  matchShopifyWebhookRoute,
  handleShopifyWebhook,
};
