'use strict';

/**
 * FR-245: BigCommerce Load + Uninstall callbacks.
 * POST /webhooks/shop/bigcommerce/uninstall (and /load) with signed_payload_jwt.
 */

const {
  verifySignedPayloadJwt,
  storeHashFromContext,
} = require('../../shared/shops/adapters/bigcommerce');
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

function resolvePath(event) {
  return String(
    (event && event.rawPath) ||
      (event &&
        event.requestContext &&
        event.requestContext.http &&
        event.requestContext.http.path) ||
      (event && event.path) ||
      '',
  );
}

function resolveMethod(event) {
  return String(
    (event &&
      event.requestContext &&
      event.requestContext.http &&
      event.requestContext.http.method) ||
      (event && event.httpMethod) ||
      'POST',
  ).toUpperCase();
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
function matchBigCommerceWebhookRoute(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '');
  if (
    m === 'POST' &&
    (p === '/webhooks/shop/bigcommerce/uninstall' ||
      p === '/webhooks/shop/bigcommerce/load' ||
      p === '/webhooks/shop/bigcommerce')
  ) {
    return `POST ${p}`;
  }
  return null;
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handleBigCommerceWebhook(event, deps = {}) {
  const secret = String(
    deps.clientSecret ||
      deps.apiSecret ||
      (deps.env && deps.env.BIGCOMMERCE_CLIENT_SECRET) ||
      process.env.BIGCOMMERCE_CLIENT_SECRET ||
      '',
  ).trim();
  const clientId = String(
    deps.clientId ||
      (deps.env && deps.env.BIGCOMMERCE_CLIENT_ID) ||
      process.env.BIGCOMMERCE_CLIENT_ID ||
      '',
  ).trim();

  const body = parseBodyObject(event);
  const token = String(
    body.signed_payload_jwt ||
      body.signed_payload ||
      (event && event.queryStringParameters && event.queryStringParameters.signed_payload_jwt) ||
      '',
  ).trim();

  const payload = verifySignedPayloadJwt(token, secret, {
    expectedAud: clientId || undefined,
  });
  if (!payload) {
    return jsonResponse(401, { ok: false, error: 'invalid_signed_payload' });
  }

  const storeHash =
    storeHashFromContext(payload.sub) ||
    String(payload.store_hash || payload.storeHash || '').trim();
  const path = resolvePath(event);
  const shops = deps.shops || defaultShops;
  const vault = deps.vault || defaultVault;
  const cancelSubscription =
    typeof deps.cancelSubscription === 'function'
      ? deps.cancelSubscription
      : async () => ({ cancelled: true, stub: true });

  // Load callback: ack only (control panel open).
  if (path.endsWith('/load') || String(payload.operation || '').toLowerCase() === 'load') {
    return jsonResponse(200, { ok: true, storeHash, operation: 'load' });
  }

  // Uninstall
  const row = storeHash
    ? shops.getByProviderShopId('bigcommerce', storeHash)
    : null;
  if (row) {
    try {
      if (String(row.status) !== 'suspended' && String(row.status) !== 'cancelled') {
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
    storeHash,
    suspended: Boolean(row),
    operation: 'uninstall',
  });
}

module.exports = {
  matchBigCommerceWebhookRoute,
  handleBigCommerceWebhook,
  resolvePath,
  resolveMethod,
};
