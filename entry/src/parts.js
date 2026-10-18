'use strict';

/**
 * FR-198: GET /parts?host&widgetGuid&offset&n HTTP adapter.
 * Public widget route (no JWT). uri query is diagnostics-only.
 */

const { queryParams } = require('./performance');
const { pageParts, PartsError } = require('../../shared/widgets/parts');
const {
  getDefaultCustomersStore,
} = require('../../shared/components/customers');

const JSON_HEADERS = { 'content-type': 'application/json' };



function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

/**
 * @param {object} event
 * @param {{
 *   store?: object,
 *   root?: string,
 *   env?: Record<string, string|undefined>,
 *   widgetEnv?: 'live'|'sandbox',
 * }} [deps]
 */
async function handleParts(event, deps = {}) {
  const envMap = deps.env || process.env;
  const query = queryParams(event);
  const host = query.host;
  const widgetGuid = query.widgetGuid;
  // uri may be present for diagnostics; never used as a key
  void query.uri;

  const root =
    deps.root != null
      ? String(deps.root)
      : envMap.A_SEARCH_WIDGET_ROOT != null
        ? String(envMap.A_SEARCH_WIDGET_ROOT)
        : '';
  if (!root) {
    return jsonResponse(500, { error: 'widget_root_unconfigured' });
  }

  const store = deps.store || getDefaultCustomersStore();
  const widgetEnv =
    deps.widgetEnv ||
    (envMap.A_SEARCH_WIDGET_ENV === 'live' ? 'live' : 'sandbox');

  try {
    const page = pageParts({
      root,
      env: widgetEnv,
      host,
      widgetGuid,
      offset: query.offset,
      n: query.n,
      store,
    });
    return jsonResponse(200, page);
  } catch (err) {
    const code =
      err instanceof PartsError
        ? err.code
        : err && err.code
          ? String(err.code)
          : 'parts_error';
    if (code === 'widget_guid_required' || code === 'invalid_widget_guid') {
      return jsonResponse(400, { error: code });
    }
    if (code === 'host_required' || code === 'invalid_offset_or_n') {
      return jsonResponse(400, { error: code });
    }
    if (code === 'widget_host_mismatch') {
      return jsonResponse(403, { error: code, parts: [], nextOffset: null });
    }
    if (code === 'widget_not_found' || code === 'widget_removed') {
      return jsonResponse(404, { error: code });
    }
    throw err;
  }
}

function isPartsRoute(method, path) {
  return method === 'GET' && path === '/parts';
}

module.exports = {
  handleParts,
  isPartsRoute,
  getDefaultStore: getDefaultCustomersStore,
};
