'use strict';

/**
 * #1344: POST /account/upgrade
 */

const { AuthError, verifyAuthorization } = require('./auth/jwt');
const { startUpgradeCheckout } = require('../../shared/account/upgrade');

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

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
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

/**
 * @param {string} method
 * @param {string} path
 */
function matchAccountUpgradeRoute(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '');
  if (m === 'POST' && p === '/account/upgrade') return 'POST /account/upgrade';
  return null;
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handleAccountUpgrade(event, deps = {}) {
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
  const body = parseBody(event && event.body);
  if (body == null) {
    return jsonResponse(400, { ok: false, error: 'invalid_json' });
  }
  try {
    const result = startUpgradeCheckout({
      host: body.host,
      userId,
      customerNumber: body.customerNumber,
      checkoutUrlFor: deps.checkoutUrlFor,
    });
    return jsonResponse(200, result);
  } catch (err) {
    const code = err && err.code ? String(err.code) : 'upgrade_error';
    return jsonResponse(400, { ok: false, error: code });
  }
}

module.exports = {
  matchAccountUpgradeRoute,
  handleAccountUpgrade,
};
