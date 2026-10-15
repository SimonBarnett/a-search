'use strict';

/**
 * FR-222: POST /account/payouts -- request payout or return setup path.
 */

const { AuthError, verifyAuthorization } = require('./auth/jwt');
const {
  createTenantRegistry,
  requestPayout,
  startPayoutSetup,
} = require('../../shared/partners/payoutOptional');

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const defaultRegistry = createTenantRegistry();

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

/**
 * @param {string} method
 * @param {string} path
 * @returns {string|null}
 */
function matchAccountPayoutsRoute(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '');
  if (m === 'POST' && p === '/account/payouts') return 'POST /account/payouts';
  if (m === 'POST' && p === '/account/stripe/link') {
    return 'POST /account/stripe/link';
  }
  return null;
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handleAccountPayouts(event, deps = {}) {
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

  const tenantCode = String(
    parsed.tenantCode || parsed.partnerCode || parsed.clubCode || userId || '',
  )
    .trim()
    .toUpperCase();

  const registry = deps.registry || defaultRegistry;
  let path = String(
    (event && event.rawPath) ||
      (event &&
        event.requestContext &&
        event.requestContext.http &&
        event.requestContext.http.path) ||
      (event && event.path) ||
      '/account/payouts',
  );
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  const q = path.indexOf('?');
  if (q >= 0) path = path.slice(0, q);

  try {
    if (path === '/account/stripe/link' || parsed.setup === true) {
      const created = await startPayoutSetup({
        registry,
        tenantCode,
        createConnectAccount:
          deps.createConnectAccount ||
          (async () => {
            const err = new Error('stripe_not_configured');
            err.code = 'stripe_not_configured';
            throw err;
          }),
        createAccountLink:
          deps.createAccountLink ||
          (async () => {
            const err = new Error('stripe_not_configured');
            err.code = 'stripe_not_configured';
            throw err;
          }),
      });
      return jsonResponse(200, {
        ok: true,
        setupRequired: false,
        stripePayoutAccountId: created.stripePayoutAccountId,
        setupUrl: created.setupUrl,
      });
    }

    const result = requestPayout({ registry, tenantCode });
    return jsonResponse(200, result);
  } catch (err) {
    const code = (err && err.code) || 'payout_failed';
    if (code === 'tenant_not_found') {
      return jsonResponse(404, { ok: false, error: code });
    }
    if (code === 'stripe_not_configured') {
      return jsonResponse(503, { ok: false, error: code });
    }
    throw err;
  }
}

module.exports = {
  matchAccountPayoutsRoute,
  handleAccountPayouts,
};
