'use strict';

/**
 * #1344: GET /account/commission
 */

const { AuthError, verifyAuthorization } = require('./auth/jwt');
const { createCommissionStore } = require('../../shared/account/commission');

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const defaultStore = createCommissionStore();

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
function matchAccountCommissionRoute(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '');
  if (m === 'GET' && p === '/account/commission') return 'GET /account/commission';
  return null;
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handleAccountCommission(event, deps = {}) {
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
  const store = deps.commissionStore || defaultStore;
  const row = store.getUnclaimed(userId);
  return jsonResponse(200, {
    ok: true,
    unclaimedMinor: row.unclaimedMinor,
    currency: row.currency,
  });
}

module.exports = {
  matchAccountCommissionRoute,
  handleAccountCommission,
};
