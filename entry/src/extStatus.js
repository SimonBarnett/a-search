'use strict';

/**
 * FR-200 / #1344 helper route: GET /ext/status?host
 * Enabled only when Club TXT is present (Partner alone never enables).
 */

const { queryParams } = require('./performance');
const { extStatus } = require('../../shared/dns/hostTxtStatus');
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

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handleExtStatus(event, deps = {}) {
  const method = String(
    (event &&
      event.requestContext &&
      event.requestContext.http &&
      event.requestContext.http.method) ||
      (event && event.httpMethod) ||
      'GET',
  ).toUpperCase();
  if (method !== 'GET') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  const envMap = deps.env || process.env;
  const query = queryParams(event);
  const host = query.host;
  if (host == null || String(host).trim() === '') {
    return jsonResponse(400, { error: 'host_required' });
  }

  const store = deps.store || getDefaultStore();
  const negTtlS =
    deps.negTtlS != null
      ? Number(deps.negTtlS)
      : envMap.EXT_STATUS_NEG_TTL_S != null
        ? Number(envMap.EXT_STATUS_NEG_TTL_S)
        : undefined;

  try {
    const status = await extStatus({
      host,
      store,
      resolveTxt: deps.resolveTxt,
      now: deps.now,
      negTtlS,
      force: deps.forceDns === true,
    });
    return jsonResponse(200, {
      enabled: status.enabled,
      clubId: status.clubId,
      partnerId: status.partnerId,
      checkedAt: status.checkedAt,
    });
  } catch (err) {
    const code = err && err.code ? String(err.code) : 'ext_status_error';
    if (code === 'host_required') {
      return jsonResponse(400, { error: code });
    }
    throw err;
  }
}

function isExtStatusRoute(method, path) {
  return method === 'GET' && path === '/ext/status';
}

module.exports = {
  handleExtStatus,
  isExtStatusRoute,
  getDefaultStore,
};
