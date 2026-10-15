'use strict';

/**
 * FR-229: HTTP entry for shared login session + post-login redirect.
 */

const {
  createSharedSession,
  resolvePostLoginRedirect,
  LoginEntryError,
} = require('../../shared/auth/loginEntry');

/**
 * @param {string} method
 * @param {string} path
 * @returns {string|null}
 */
function matchLoginEntryRoute(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '');
  if (m === 'POST' && p === '/auth/session') return 'POST /auth/session';
  if (m === 'GET' && p === '/auth/redirect') return 'GET /auth/redirect';
  return null;
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: JSON.stringify(payload),
  };
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

function queryOf(event) {
  const q =
    (event && event.queryStringParameters) ||
    (event && event.query) ||
    {};
  return q && typeof q === 'object' ? q : {};
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handleLoginSession(event, deps) {
  void deps;
  const body = parseBody(event && event.body);
  if (body == null) {
    return jsonResponse(400, { ok: false, error: 'invalid_json' });
  }
  try {
    const session = createSharedSession(body);
    const redirect =
      session.intent || session.role
        ? resolvePostLoginRedirect({ session })
        : null;
    return jsonResponse(200, { ok: true, session, redirect });
  } catch (err) {
    if (err instanceof LoginEntryError) {
      const status = err.code === 'contact_required' ? 403 : 400;
      return jsonResponse(status, { ok: false, error: err.code });
    }
    throw err;
  }
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handleLoginRedirect(event, deps) {
  void deps;
  const q = queryOf(event);
  try {
    const redirect = resolvePostLoginRedirect({
      intent: q.intent,
      role: q.role,
    });
    return jsonResponse(200, { ok: true, redirect });
  } catch (err) {
    if (err instanceof LoginEntryError) {
      return jsonResponse(400, { ok: false, error: err.code });
    }
    throw err;
  }
}

/**
 * @param {object} event
 * @param {string} routeId
 * @param {object} [deps]
 */
async function handleLoginEntry(event, routeId, deps) {
  if (routeId === 'POST /auth/session') {
    return handleLoginSession(event, deps);
  }
  if (routeId === 'GET /auth/redirect') {
    return handleLoginRedirect(event, deps);
  }
  return jsonResponse(404, { ok: false, error: 'unknown_route' });
}

module.exports = {
  matchLoginEntryRoute,
  handleLoginEntry,
  handleLoginSession,
  handleLoginRedirect,
};
