'use strict';

/**
 * FR-237: POST /webhooks/shop/wix
 * App Removed -> suspended(uninstalled) + subscription cancel stub (FR-239).
 */

const {
  verifyWixWebhookHmac,
} = require('../../shared/shops/adapters/wix');
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
function matchWixWebhookRoute(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '');
  if (m === 'POST' && p === '/webhooks/shop/wix') {
    return 'POST /webhooks/shop/wix';
  }
  return null;
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handleWixWebhook(event, deps = {}) {
  const secret = String(
    (deps.clientSecret ||
      deps.appSecret ||
      deps.apiSecret ||
      (deps.env && deps.env.WIX_APP_SECRET) ||
      process.env.WIX_APP_SECRET ||
      '') + '',
  ).trim();
  const hmac = headerGet(event && event.headers, 'x-wix-signature');
  const eventType = String(
    headerGet(event && event.headers, 'x-wix-event-type') ||
      headerGet(event && event.headers, 'x-wix-topic') ||
      '',
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

  let ok = false;
  if (typeof deps.verifyWebhookJwt === 'function') {
    ok = await deps.verifyWebhookJwt(rawBody, event && event.headers);
  } else {
    ok = verifyWixWebhookHmac(rawBody, hmac, secret);
  }
  if (!ok) {
    return jsonResponse(401, { ok: false, error: 'invalid_signature' });
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

  const instanceId = String(
    payload.instanceId ||
      (payload.data && payload.data.instanceId) ||
      (payload.instance && payload.instance.instanceId) ||
      '',
  ).trim();

  const removed =
    eventType.includes('app_removed') ||
    eventType.includes('app/removed') ||
    eventType === 'appremoved' ||
    String(payload.eventType || payload.action || '')
      .toLowerCase()
      .includes('app_removed') ||
    String(payload.eventType || payload.action || '')
      .toLowerCase()
      .includes('removed');

  if (removed) {
    const row = instanceId
      ? shops.getByProviderShopId('wix', instanceId)
      : null;
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

  return jsonResponse(200, { ok: true, ignored: true, eventType });
}

module.exports = {
  matchWixWebhookRoute,
  handleWixWebhook,
};
