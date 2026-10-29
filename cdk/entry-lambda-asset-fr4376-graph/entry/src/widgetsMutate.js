'use strict';

/**
 * #1344: PATCH /widgets/{guid} + POST /widgets/{guid}/feedback
 */

const { AuthError, verifyAuthorization } = require('./auth/jwt');
const {
  createWidget,
  createWidgetsRegistry,
  isValidWidgetGuid,
} = require('../../shared/widgets/createWidget');
const {
  withWidgetLookup,
  patchWidgetLayout,
} = require('../../shared/widgets/patchWidget');
const {
  createFeedbackStore,
  buildFeedbackEntry,
} = require('../../shared/widgets/feedbackStore');
const { createUpgradeCache } = require('../../shared/account/upgrade');

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const defaultRegistry = withWidgetLookup(createWidgetsRegistry());
const defaultFeedback = createFeedbackStore();
const defaultUpgrade = createUpgradeCache();

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

function pathOf(event) {
  return String(
    (event && event.rawPath) ||
      (event &&
        event.requestContext &&
        event.requestContext.http &&
        event.requestContext.http.path) ||
      (event && event.path) ||
      '',
  );
}

/**
 * @param {string} method
 * @param {string} path
 */
function matchWidgetsMutateRoute(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '');
  if (m === 'PATCH' && /^\/widgets\/[^/]+$/.test(p)) {
    return 'PATCH /widgets/{widgetGuid}';
  }
  if (m === 'POST' && /^\/widgets\/[^/]+\/feedback$/.test(p)) {
    return 'POST /widgets/{widgetGuid}/feedback';
  }
  return null;
}

function guidFromPath(path) {
  const m = String(path).match(/^\/widgets\/([^/]+)(?:\/feedback)?$/);
  return m ? m[1] : '';
}

async function requireUser(event, deps) {
  const env = deps.env || process.env;
  const verify = deps.verifyAuthorization || verifyAuthorization;
  const authHeader =
    headerGet(event && event.headers, 'authorization') ||
    headerGet(event && event.headers, 'Authorization');
  try {
    const auth = await verify(authHeader, { env, body: undefined });
    return { ok: true, userId: auth.userId };
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, response: jsonResponse(401, { ok: false, error: err.code }) };
    }
    return {
      ok: false,
      response: jsonResponse(401, { ok: false, error: 'unauthorized' }),
    };
  }
}

/**
 * @param {object} event
 * @param {string} routeId
 * @param {object} [deps]
 */
async function handleWidgetsMutate(event, routeId, deps = {}) {
  const auth = await requireUser(event, deps);
  if (!auth.ok) return auth.response;

  const path = pathOf(event);
  const widgetGuid = guidFromPath(path);
  if (!isValidWidgetGuid(widgetGuid)) {
    return jsonResponse(400, { ok: false, error: 'invalid_widget_guid' });
  }

  const registry = deps.widgetRegistry || defaultRegistry;
  const upgradeCache = deps.upgradeCache || defaultUpgrade;
  const feedbackStore = deps.feedbackStore || defaultFeedback;
  const jwtHost =
    (event && event.headers && (event.headers['x-a-search-host'] || event.headers['X-A-Search-Host'])) ||
    undefined;

  if (routeId === 'PATCH /widgets/{widgetGuid}') {
    const body = parseBody(event && event.body);
    if (body == null) {
      return jsonResponse(400, { ok: false, error: 'invalid_json' });
    }
    try {
      const row = patchWidgetLayout({
        widgetGuid,
        layout: body.layout,
        host: body.host,
        jwtHost: body.host || jwtHost,
        registry,
        isHostUpgraded: (h) => upgradeCache.isUpgraded(h),
      });
      return jsonResponse(200, { ok: true, widget: row });
    } catch (err) {
      const code = err && err.code ? String(err.code) : 'patch_error';
      if (code === 'upgrade_required') {
        return jsonResponse(402, { ok: false, error: code });
      }
      if (code === 'widget_host_mismatch') {
        return jsonResponse(403, { ok: false, error: code });
      }
      if (code === 'widget_not_found') {
        return jsonResponse(404, { ok: false, error: code });
      }
      return jsonResponse(400, { ok: false, error: code });
    }
  }

  if (routeId === 'POST /widgets/{widgetGuid}/feedback') {
    const body = parseBody(event && event.body);
    if (body == null) {
      return jsonResponse(400, { ok: false, error: 'invalid_json' });
    }
    const row = registry.get(widgetGuid);
    if (!row) {
      return jsonResponse(404, { ok: false, error: 'widget_not_found' });
    }
    try {
      const entry = buildFeedbackEntry(body, auth.userId, deps.nowMs);
      feedbackStore.append(widgetGuid, entry);
      return jsonResponse(200, {
        ok: true,
        entry,
        entries: feedbackStore.list(widgetGuid),
      });
    } catch (err) {
      const code = err && err.code ? String(err.code) : 'feedback_error';
      return jsonResponse(400, { ok: false, error: code });
    }
  }

  return jsonResponse(404, { ok: false, error: 'unknown_route' });
}

module.exports = {
  matchWidgetsMutateRoute,
  handleWidgetsMutate,
  // re-export helpers for tests
  defaultRegistry,
  createWidget,
  withWidgetLookup,
  createWidgetsRegistry,
};
