'use strict';

/**
 * FR-216 HTTP: POST /merchant/shops/connect + GET|POST /merchant/shops/callback/{provider}
 */

const { AuthError, verifyAuthorization } = require('./auth/jwt');
const {
  createNonceStore,
  createShopsRegistry,
  startConnect,
  completeConnect,
} = require('../../shared/shops/connect');

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

/** Module-level defaults (tests inject deps). */
const defaultNonces = createNonceStore();
const defaultShops = createShopsRegistry();

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

function parseBody(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function resolvePath(event) {
  let path = String(
    (event && event.rawPath) ||
      (event &&
        event.requestContext &&
        event.requestContext.http &&
        event.requestContext.http.path) ||
      (event && event.path) ||
      '',
  );
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  const q = path.indexOf('?');
  if (q >= 0) path = path.slice(0, q);
  return path;
}

function resolveMethod(event) {
  return String(
    (event &&
      event.requestContext &&
      event.requestContext.http &&
      event.requestContext.http.method) ||
      (event && event.httpMethod) ||
      'GET',
  ).toUpperCase();
}

function queryParams(event) {
  const q = (event && event.queryStringParameters) || {};
  return q && typeof q === 'object' ? q : {};
}

/**
 * @param {string} method
 * @param {string} path
 * @returns {string|null}
 */
function matchMerchantShopsRoute(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '');
  if (m === 'GET' && p === '/merchant/shops') {
    return 'GET /merchant/shops';
  }
  if (m === 'DELETE' && /^\/merchant\/shops\/[^/]+$/.test(p)) {
    return 'DELETE /merchant/shops/{shopId}';
  }
  if (m === 'POST' && p === '/merchant/shops/connect') {
    return 'POST /merchant/shops/connect';
  }
  if (
    (m === 'GET' || m === 'POST') &&
    /^\/merchant\/shops\/callback\/[^/]+$/.test(p)
  ) {
    return 'GET|POST /merchant/shops/callback/{provider}';
  }
  return null;
}

function shopIdFromDeletePath(path) {
  const m = String(path || '').match(/^\/merchant\/shops\/([^/]+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function providerFromCallbackPath(path) {
  const m = String(path || '').match(
    /^\/merchant\/shops\/callback\/([^/]+)$/,
  );
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * JWT merchant connect start.
 * @param {object} event
 * @param {object} [deps]
 */
async function handleMerchantShopsConnect(event, deps = {}) {
  const env = deps.env || process.env;
  const verify = deps.verifyAuthorization || verifyAuthorization;
  const authHeader =
    headerGet(event && event.headers, 'authorization') ||
    headerGet(event && event.headers, 'Authorization');

  let userId;
  try {
    const auth = await verify(authHeader, { env, body: undefined });
    userId = auth.userId;
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse(401, { ok: false, error: err.code });
    }
    return jsonResponse(401, { ok: false, error: 'unauthorized' });
  }

  const parsed = parseBody(event && event.body);
  if (parsed === null) {
    return jsonResponse(400, { ok: false, error: 'invalid_json' });
  }
  const provider = parsed.provider;
  if (!provider || typeof provider !== 'string') {
    return jsonResponse(400, { ok: false, error: 'provider_required' });
  }

  const envName =
    deps.envName ||
    (parsed.sandbox === true || env.A_SEARCH_ENV === 'sandbox'
      ? 'sandbox'
      : 'live');

  try {
    const result = await startConnect({
      merchantUserId: userId,
      env: envName,
      provider,
      shopDomain:
        typeof parsed.shopDomain === 'string' ? parsed.shopDomain : undefined,
      adapterOpts: {
        session: parsed.session,
        consumerKey:
          typeof parsed.consumerKey === 'string'
            ? parsed.consumerKey
            : undefined,
        consumerSecret:
          typeof parsed.consumerSecret === 'string'
            ? parsed.consumerSecret
            : undefined,
        httpRequest: deps.httpRequest,
        ...(deps.adapterOpts || {}),
      },
      nonces: deps.nonces || defaultNonces,
      shops: deps.shops || defaultShops,
      nowMs: deps.nowMs,
      callbackBaseUrl: deps.callbackBaseUrl,
    });

    // FR-238 advanced paste: keys already validated in startConnect; finish Shop row.
    const pasteKeys =
      String(provider).toLowerCase() === 'woocommerce' &&
      typeof parsed.consumerKey === 'string' &&
      parsed.consumerKey &&
      typeof parsed.consumerSecret === 'string' &&
      parsed.consumerSecret;
    if (pasteKeys) {
      const subscribeBaseUrl =
        deps.subscribeBaseUrl ||
        (deps.env && deps.env.A_SEARCH_SUBSCRIBE_URL) ||
        process.env.A_SEARCH_SUBSCRIBE_URL ||
        'https://smartcatalogue.uk/wizard/subscribe';
      const done = await completeConnect({
        provider,
        state: result.state,
        req: {
          body: {
            user_id: result.state,
            consumer_key: parsed.consumerKey,
            consumer_secret: parsed.consumerSecret,
            key_permissions: 'read',
            key_id: 'paste',
          },
        },
        adapterOpts: {
          httpRequest: deps.httpRequest,
          vault: deps.vault,
          ...(deps.adapterOpts || {}),
        },
        nonces: deps.nonces || defaultNonces,
        shops: deps.shops || defaultShops,
        nowMs: deps.nowMs,
        subscribeBaseUrl,
      });
      return jsonResponse(200, {
        ok: true,
        paste: true,
        shop: done.shop,
        redirectTo: done.redirectTo,
      });
    }

    return jsonResponse(200, {
      ok: true,
      state: result.state,
      redirectUrl: result.redirectUrl,
      loginRequired: result.loginRequired,
    });
  } catch (err) {
    const code = (err && err.code) || 'connect_failed';
    if (
      code === 'unknown_provider' ||
      code === 'provider_required' ||
      code === 'invalid_shop_domain' ||
      code === 'wc_probe_failed' ||
      code === 'keys_invalid' ||
      code === 'keys_required' ||
      code === 'invalid_key_permissions'
    ) {
      return jsonResponse(400, { ok: false, error: code });
    }
    if (code === 'empty_connect') {
      return jsonResponse(409, { ok: false, error: code });
    }
    throw err;
  }
}

/**
 * OAuth / app-install callback (state nonce; no JWT required).
 * @param {object} event
 * @param {object} [deps]
 */
async function handleMerchantShopsCallback(event, deps = {}) {
  const path = resolvePath(event);
  const provider = providerFromCallbackPath(path);
  if (!provider) {
    return jsonResponse(400, { ok: false, error: 'provider_required' });
  }
  const q = queryParams(event);
  const parsed = parseBody(event && event.body);
  if (parsed === null) {
    return jsonResponse(400, { ok: false, error: 'invalid_json' });
  }
  // Woo /wc-auth POSTs user_id = FR-216 state (FR-238).
  const state =
    q.state ||
    parsed.state ||
    q.user_id ||
    parsed.user_id;
  if (!state) {
    return jsonResponse(400, { ok: false, error: 'invalid_state' });
  }

  const subscribeBaseUrl =
    deps.subscribeBaseUrl ||
    (deps.env && deps.env.A_SEARCH_SUBSCRIBE_URL) ||
    process.env.A_SEARCH_SUBSCRIBE_URL ||
    'https://smartcatalogue.uk/wizard/subscribe';

  const adapterOpts =
    typeof deps.adapterOptsFromReq === 'function'
      ? deps.adapterOptsFromReq(event, { provider, state, query: q, body: parsed })
      : deps.adapterOpts || {};

  try {
    const done = await completeConnect({
      provider,
      state: String(state),
      req: { query: q, body: parsed, headers: event && event.headers },
      adapterOpts,
      nonces: deps.nonces || defaultNonces,
      shops: deps.shops || defaultShops,
      nowMs: deps.nowMs,
      subscribeBaseUrl,
    });
    return {
      statusCode: 302,
      headers: {
        location: done.redirectTo,
        'cache-control': 'no-store',
      },
      body: '',
    };
  } catch (err) {
    const code = (err && err.code) || 'connect_failed';
    if (
      code === 'invalid_state' ||
      code === 'nonce_expired' ||
      code === 'provider_mismatch' ||
      code === 'login_required' ||
      code === 'unknown_provider' ||
      code === 'empty_connect' ||
      code === 'invalid_hmac' ||
      code === 'invalid_signed_instance' ||
      code === 'invalid_shop_domain' ||
      code === 'code_required' ||
      code === 'instance_id_required' ||
      code === 'wix_app_credentials_missing' ||
      code === 'shopify_app_credentials_missing' ||
      code === 'invalid_key_permissions' ||
      code === 'keys_required' ||
      code === 'keys_invalid' ||
      code === 'wc_probe_failed'
    ) {
      return jsonResponse(400, { ok: false, error: code });
    }
    if (code === 'shop_already_connected') {
      return jsonResponse(409, { ok: false, error: code });
    }
    throw err;
  }
}


/**
 * FR-235: GET /merchant/shops — own shops only (JWT merchant).
 */
async function handleMerchantShopsList(event, deps = {}) {
  const env = deps.env || process.env;
  const verify = deps.verifyAuthorization || verifyAuthorization;
  const authHeader =
    headerGet(event && event.headers, 'authorization') ||
    headerGet(event && event.headers, 'Authorization');
  let userId;
  let role;
  try {
    const auth = await verify(authHeader, { env, body: undefined });
    userId = auth.userId;
    role = auth.role;
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse(401, { ok: false, error: err.code });
    }
    return jsonResponse(401, { ok: false, error: 'unauthorized' });
  }
  if (role && String(role).toLowerCase() !== 'merchant') {
    return jsonResponse(403, { ok: false, error: 'merchant_role_required' });
  }
  const envName =
    deps.envName ||
    (typeof env === 'string'
      ? env
      : env.A_SEARCH_ENV === 'sandbox'
        ? 'sandbox'
        : 'live');
  const shops = deps.shops || defaultShops;
  return jsonResponse(200, {
    ok: true,
    shops: shops.listPublic(userId, envName),
  });
}

/**
 * FR-235: DELETE /merchant/shops/{shopId} — cancel at period end + mark cancelled.
 */
async function handleMerchantShopsDelete(event, deps = {}) {
  const env = deps.env || process.env;
  const verify = deps.verifyAuthorization || verifyAuthorization;
  const authHeader =
    headerGet(event && event.headers, 'authorization') ||
    headerGet(event && event.headers, 'Authorization');
  let userId;
  try {
    const auth = await verify(authHeader, { env, body: undefined });
    userId = auth.userId;
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse(401, { ok: false, error: err.code });
    }
    return jsonResponse(401, { ok: false, error: 'unauthorized' });
  }
  const shopId = shopIdFromDeletePath(resolvePath(event));
  if (!shopId) {
    return jsonResponse(400, { ok: false, error: 'shopId_required' });
  }
  const shops = deps.shops || defaultShops;
  const row = shops.get(shopId);
  if (!row || row.merchantUserId !== userId) {
    return jsonResponse(404, { ok: false, error: 'shop_not_found' });
  }
  if (typeof deps.cancelSubscription === 'function') {
    await deps.cancelSubscription({
      shopId,
      stripeSubscriptionId: row.stripeSubscriptionId,
      atPeriodEnd: true,
    });
  }
  try {
    const next = shops.transition(shopId, 'cancelled', {
      reason: 'admin',
      nowMs: deps.nowMs,
    });
    return jsonResponse(200, {
      ok: true,
      shopId: next.shopId,
      status: next.status,
      suspendReason: next.suspendReason,
      atPeriodEnd: true,
    });
  } catch (err) {
    if (err && err.code === 'illegal_transition') {
      return jsonResponse(409, { ok: false, error: err.code });
    }
    throw err;
  }
}

/**
 * FR-235 dispatcher for list/delete (connect/callback keep dedicated handlers).
 */
async function handleMerchantShops(event, routeId, deps = {}) {
  if (routeId === 'GET /merchant/shops') {
    return handleMerchantShopsList(event, deps);
  }
  if (routeId === 'DELETE /merchant/shops/{shopId}') {
    return handleMerchantShopsDelete(event, deps);
  }
  if (routeId === 'POST /merchant/shops/connect') {
    return handleMerchantShopsConnect(event, deps);
  }
  if (routeId === 'GET|POST /merchant/shops/callback/{provider}') {
    return handleMerchantShopsCallback(event, deps);
  }
  return jsonResponse(404, { ok: false, error: 'unknown_route' });
}
module.exports = {
  matchMerchantShopsRoute,
  handleMerchantShopsConnect,
  handleMerchantShopsCallback,
  handleMerchantShopsList,
  handleMerchantShopsDelete,
  handleMerchantShops,
  resolveMethod,
  resolvePath,
};
