'use strict';

/**
 * FR-219 / FR-232 prelude: POST /widgets -- mint widgetGuid + snippet.
 * Anonymous OK (smartcatalogue / clubmadeira copy pages). JWT optional later.
 */

const {
  createWidget,
  createWidgetsRegistry,
  DEFAULT_WIDGET_JS_URL,
} = require('../../shared/widgets/createWidget');

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const defaultRegistry = createWidgetsRegistry();

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
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
function matchWidgetsCreateRoute(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '');
  if (m === 'POST' && p === '/widgets') return 'POST /widgets';
  return null;
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handleWidgetsCreate(event, deps = {}) {
  const parsed = parseBody(event && event.body);
  if (parsed === null) {
    return jsonResponse(400, { error: 'invalid_json' });
  }
  const layout = parsed.layout;
  const createdVia = parsed.createdVia || 'smartcatalogue';
  const host =
    typeof parsed.host === 'string' && parsed.host.trim()
      ? parsed.host.trim()
      : undefined;

  const env = deps.env || process.env;
  const widgetJsUrl =
    deps.widgetJsUrl ||
    env.A_SEARCH_WIDGET_JS_URL ||
    DEFAULT_WIDGET_JS_URL;

  try {
    const created = createWidget({
      layout: String(layout || ''),
      createdVia: String(createdVia),
      host,
      createdByUserId: deps.userId || null,
      registry: deps.registry || defaultRegistry,
      widgetJsUrl,
      nowMs: deps.nowMs,
    });
    return jsonResponse(201, {
      widgetGuid: created.widgetGuid,
      layout: created.layout,
      snippet: created.snippet,
    });
  } catch (err) {
    const code = (err && err.code) || 'create_failed';
    if (
      code === 'invalid_layout' ||
      code === 'invalid_created_via' ||
      code === 'invalid_widget_guid'
    ) {
      return jsonResponse(400, { error: code });
    }
    throw err;
  }
}

module.exports = {
  matchWidgetsCreateRoute,
  handleWidgetsCreate,
};
