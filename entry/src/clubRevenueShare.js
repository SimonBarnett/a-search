'use strict';

/**
 * FR-249 / #1363: GET /club/revenue-share?period=YYYY-MM
 * JWT club role; own club data only.
 */

const { AuthError, verifyAuthorization } = require('./auth/jwt');
const {
  createRevenueShareStore,
  RevenueShareError,
} = require('../../shared/finance/revenueShare');

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const defaultStore = createRevenueShareStore();

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

function queryGet(event, name) {
  const q =
    (event && event.queryStringParameters) ||
    (event && event.query) ||
    {};
  if (!q || typeof q !== 'object') return undefined;
  return q[name];
}

/**
 * @param {string} method
 * @param {string} path
 */
function matchClubRevenueShareRoute(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '');
  if (m === 'GET' && p === '/club/revenue-share') return 'GET /club/revenue-share';
  return null;
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handleClubRevenueShare(event, deps = {}) {
  const env = deps.env || process.env;
  const verify = deps.verifyAuthorization || verifyAuthorization;
  const authHeader =
    headerGet(event && event.headers, 'authorization') ||
    headerGet(event && event.headers, 'Authorization');
  let auth;
  try {
    auth = await verify(authHeader, { env, body: undefined });
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse(401, { ok: false, error: err.code });
    }
    return jsonResponse(401, { ok: false, error: 'unauthorized' });
  }

  const role = String((auth && auth.role) || '')
    .trim()
    .toLowerCase();
  const clubId = String((auth && (auth.clubId || auth.tenantId || auth.userId)) || '')
    .trim()
    .toUpperCase();
  if (role && role !== 'club') {
    return jsonResponse(403, { ok: false, error: 'forbidden_not_club' });
  }
  if (!clubId) {
    return jsonResponse(403, { ok: false, error: 'forbidden_missing_club' });
  }

  const period = String(queryGet(event, 'period') || '')
    .trim();
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return jsonResponse(400, { ok: false, error: 'invalid_period' });
  }

  const store = deps.revenueShareStore || defaultStore;
  try {
    const periodRow = store.getPeriod(period);
    const share = store.getClubShare(period, clubId);
    const status = periodRow ? periodRow.status : 'open';
    return jsonResponse(200, {
      ok: true,
      period,
      poolMinor: periodRow ? periodRow.poolMinor : null,
      clubShareMinor: share ? share.amountMinor : 0,
      clicks: share ? share.clicks : 0,
      impressions: 0,
      score: share ? share.score : 0,
      status,
    });
  } catch (err) {
    if (err instanceof RevenueShareError) {
      return jsonResponse(400, { ok: false, error: err.code });
    }
    throw err;
  }
}

module.exports = {
  matchClubRevenueShareRoute,
  handleClubRevenueShare,
};
