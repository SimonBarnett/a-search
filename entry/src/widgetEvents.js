'use strict';

/**
 * FR-234: POST /w/events (public beacon; always 204 when well-formed).
 */

const {
  ingestWidgetEventsBatch,
} = require('../../shared/events/ingestBatch');
const {
  getDefaultWidgetStatsStore,
} = require('../../shared/events/memoryWidgetStatsStore');
const {
  getDefaultCustomersStore,
} = require('../../shared/components/customers');

function headerGet(headers, name) {
  if (!headers || typeof headers !== 'object') return undefined;
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === want) return v;
  }
  return undefined;
}

function originHostFromHeaders(headers) {
  const origin = headerGet(headers, 'origin');
  if (origin) {
    try {
      return new URL(String(origin)).host;
    } catch {
      /* fall through */
    }
  }
  const referer = headerGet(headers, 'referer');
  if (referer) {
    try {
      return new URL(String(referer)).host;
    } catch {
      /* fall through */
    }
  }
  return '';
}

/**
 * @param {string} method
 * @param {string} path
 */
function matchWidgetEventsRoute(method, path) {
  return method === 'POST' && path === '/w/events' ? 'POST /w/events' : null;
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handleWidgetEvents(event, deps = {}) {
  const headers = (event && event.headers) || {};
  const envMap = deps.env || process.env;
  const widgetEnv =
    deps.widgetEnv ||
    (envMap.A_SEARCH_WIDGET_ENV === 'live' ? 'live' : 'sandbox');
  try {
    const result = await ingestWidgetEventsBatch({
      body: event && event.body,
      headers,
      store: deps.store || getDefaultCustomersStore(),
      statsStore: deps.statsStore || getDefaultWidgetStatsStore(),
      env: widgetEnv,
      nowMs: deps.nowMs,
      enqueue: deps.enqueueWidgetEvents,
      applyInline: deps.applyInline !== false,
      originHost: deps.originHost != null ? deps.originHost : originHostFromHeaders(headers),
      webdriver: deps.webdriver,
    });
    return { statusCode: result.statusCode || 204, headers: {}, body: '' };
  } catch (err) {
    const status = err && err.statusCode ? Number(err.statusCode) : 400;
    if (status === 413) {
      return {
        statusCode: 413,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'payload_too_large' }),
      };
    }
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: err && err.code ? err.code : 'bad_request' }),
    };
  }
}

module.exports = {
  matchWidgetEventsRoute,
  handleWidgetEvents,
  originHostFromHeaders,
};
