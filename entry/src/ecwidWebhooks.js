'use strict';

/**
 * FR-246: Ecwid application.uninstalled webhook.
 * POST /webhooks/shop/ecwid — verify X-Ecwid-Webhook-Signature.
 */

const {
  verifyWebhookSignature,
} = require('../../shared/shops/adapters/ecwid');
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

function parseBodyObject(event) {
  if (!event || event.body == null) return {};
  if (typeof event.body === 'object') return event.body;
  try {
    return JSON.parse(String(event.body));
  } catch {
    return {};
  }
}

/**
 * @param {string} method
 * @param {string} path
 */
function matchEcwidWebhookRoute(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '');
  if (m === 'POST' && p === '/webhooks/shop/ecwid') {
    return 'POST /webhooks/shop/ecwid';
  }
  return null;
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handleEcwidWebhook(event, deps = {}) {
  const secret = String(
    deps.clientSecret ||
      deps.apiSecret ||
      (deps.env && deps.env.ECWID_CLIENT_SECRET) ||
      process.env.ECWID_CLIENT_SECRET ||
      '',
  ).trim();

  const body = parseBodyObject(event);
  const signature = headerGet(
    event && event.headers,
    'x-ecwid-webhook-signature',
  );

  if (!verifyWebhookSignature(signature, body, secret)) {
    return jsonResponse(401, { ok: false, error: 'invalid_webhook_signature' });
  }

  const eventType = String(body.eventType || '').toLowerCase();
  const storeId = String(
    body.storeId != null
      ? body.storeId
      : body.entityId != null
        ? body.entityId
        : '',
  ).trim();

  const shops = deps.shops || defaultShops;
  const cancelSubscription =
    typeof deps.cancelSubscription === 'function'
      ? deps.cancelSubscription
      : async () => ({ cancelled: true, stub: true });

  if (eventType !== 'application.uninstalled') {
    return jsonResponse(200, { ok: true, ignored: true, eventType });
  }

  const row = storeId ? shops.getByProviderShopId('ecwid', storeId) : null;
  if (row) {
    try {
      if (
        String(row.status) !== 'suspended' &&
        String(row.status) !== 'cancelled'
      ) {
        shops.transition(row.shopId, 'suspended', {
          reason: 'uninstalled',
          nowMs: deps.nowMs,
        });
      }
    } catch {
      /* illegal transition */
    }
    await cancelSubscription({ shopId: row.shopId, shop: row });
  }

  return jsonResponse(200, {
    ok: true,
    storeId,
    suspended: Boolean(row),
    eventType,
  });
}

module.exports = {
  matchEcwidWebhookRoute,
  handleEcwidWebhook,
};
