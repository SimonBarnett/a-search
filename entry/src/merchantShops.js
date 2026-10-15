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
        ...(deps.adapterOpts || {}),
      },
      nonces: deps.nonces || defaultNonces,
      shops: deps.shops || defaultShops,
      nowMs: deps.nowMs,
      callbackBaseUrl: deps.callbackBaseUrl,
    });
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
      code === 'invalid_shop_domain'
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
  const state = q.state || parsed.state;
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
      code === 'invalid_shop_domain' ||
      code === 'code_required'
    ) {
      return jsonResponse(400, { ok: false, error: code });
    }
    throw err;
  }
}

module.exports = {
  matchMerchantShopsRoute,
  handleMerchantShopsConnect,
  handleMerchantShopsCallback,
  resolveMethod,
  resolvePath,
};
