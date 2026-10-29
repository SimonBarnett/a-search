'use strict';

/**
 * FR-231: HTTP OAuth callback -- fail closed without contact; AL3 error copy.
 */

const {
  completeOAuthLogin,
  OAUTH_NO_CONTACT_CODE,
} = require('../../shared/auth/oauthCallback');

/**
 * @param {string} method
 * @param {string} path
 * @returns {string|null}
 */
function matchOAuthCallbackRoute(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '');
  if (m === 'POST' && p === '/auth/oauth/callback') {
    return 'POST /auth/oauth/callback';
  }
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

/**
 * @param {object} event
 * @param {string} routeId
 * @param {object} [deps]
 */
async function handleOAuthCallback(event, routeId, deps) {
  if (routeId !== 'POST /auth/oauth/callback') {
    return jsonResponse(404, { ok: false, error: 'unknown_route' });
  }
  const body = parseBody(event && event.body);
  if (body == null) {
    return jsonResponse(400, { ok: false, error: 'invalid_json' });
  }
  const result = await completeOAuthLogin(
    {
      provider: body.provider,
      code: body.code,
      profile: body.profile,
      intent: body.intent,
      role: body.role,
    },
    deps,
  );
  if (!result.ok) {
    const status = result.error === OAUTH_NO_CONTACT_CODE ? 403 : 400;
    return jsonResponse(status, result);
  }
  return jsonResponse(200, {
    ok: true,
    session: result.session,
    userId: result.userId,
  });
}

module.exports = {
  matchOAuthCallbackRoute,
  handleOAuthCallback,
};
