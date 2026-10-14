'use strict';

/**
 * FR-199 + FR-200: GET /go HTTP adapter (approved path + DNS TXT signup gate).
 * Public route (no JWT). Prefetch headers skip click recording.
 */

const { queryParams } = require('./performance');
const { resolveGo, GoError } = require('../../shared/widgets/go');
const {
  MemoryCustomersStore,
} = require('../../shared/components/customers');

const JSON_HEADERS = { 'content-type': 'application/json' };

let defaultStore = null;

function getDefaultStore() {
  if (!defaultStore) defaultStore = new MemoryCustomersStore();
  return defaultStore;
}

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

function isPrefetch(event) {
  const purpose =
    headerGet(event && event.headers, 'sec-purpose') ||
    headerGet(event && event.headers, 'purpose') ||
    '';
  return String(purpose).toLowerCase().includes('prefetch');
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handleGo(event, deps = {}) {
  const method = String(
    (event &&
      event.requestContext &&
      event.requestContext.http &&
      event.requestContext.http.method) ||
      (event && event.httpMethod) ||
      'GET',
  ).toUpperCase();
  if (method === 'HEAD') {
    return jsonResponse(204, {});
  }
  if (method !== 'GET') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  const envMap = deps.env || process.env;
  const query = queryParams(event);
  const root =
    deps.root != null
      ? String(deps.root)
      : envMap.A_SEARCH_WIDGET_ROOT != null
        ? String(envMap.A_SEARCH_WIDGET_ROOT)
        : '';
  if (!root) {
    return jsonResponse(500, { error: 'widget_root_unconfigured' });
  }

  const store = deps.store || getDefaultStore();
  const widgetEnv =
    deps.widgetEnv ||
    (envMap.A_SEARCH_WIDGET_ENV === 'live' ? 'live' : 'sandbox');

  try {
    const signupUrl =
      deps.signupUrl != null
        ? String(deps.signupUrl)
        : envMap.A_SEARCH_SIGNUP_URL != null
          ? String(envMap.A_SEARCH_SIGNUP_URL)
          : '';
    const negTtlS =
      deps.negTtlS != null
        ? Number(deps.negTtlS)
        : envMap.EXT_STATUS_NEG_TTL_S != null
          ? Number(envMap.EXT_STATUS_NEG_TTL_S)
          : undefined;
    const result = await resolveGo({
      root,
      env: widgetEnv,
      host: query.host,
      widgetGuid: query.widgetGuid,
      part: query.part,
      cid: query.cid,
      store,
      stampUrl: deps.stampUrl,
      recordClick: deps.recordClick,
      prefetch: isPrefetch(event),
      signupUrl,
      resolveTxt: deps.resolveTxt,
      now: deps.now,
      negTtlS,
      forceDns: deps.forceDns === true,
      envMap,
    });
    if (result.signup) {
      return jsonResponse(200, { url: result.url });
    }
    return jsonResponse(200, {
      url: result.url,
      clickId: result.clickId,
    });
  } catch (err) {
    const code =
      err instanceof GoError
        ? err.code
        : err && err.code
          ? String(err.code)
          : 'go_error';
    if (
      code === 'widget_guid_required' ||
      code === 'invalid_widget_guid' ||
      code === 'part_required' ||
      code === 'host_required'
    ) {
      return jsonResponse(400, { error: code });
    }
    if (code === 'widget_host_mismatch') {
      return jsonResponse(403, { error: code });
    }
    if (code === 'host_not_approved') {
      // FR-200 signup path; approved-path returns closed error (no part click).
      return jsonResponse(403, { error: code });
    }
    if (code === 'part_not_found' || code === 'widget_not_found') {
      return jsonResponse(404, { error: code });
    }
    if (code === 'tracking_unavailable') {
      return jsonResponse(503, { error: code });
    }
    throw err;
  }
}

function isGoRoute(method, path) {
  return (method === 'GET' || method === 'HEAD') && path === '/go';
}

module.exports = {
  handleGo,
  isGoRoute,
  getDefaultStore,
  isPrefetch,
};
