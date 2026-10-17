'use strict';

/**
 * FR-234: GET /widgets/stats and GET /widgets/{widgetGuid}/stats (JWT).
 */

const { AuthError, verifyAuthorization } = require('./auth/jwt');
const {
  getDefaultWidgetStatsStore,
} = require('../../shared/events/memoryWidgetStatsStore');
const {
  getDefaultCustomersStore,
  getCustomerByHost,
  getWidget,
  listActiveWidgets,
  normalizeHost,
} = require('../../shared/components/customers');
const { ctr } = require('../../shared/events/rollupStatsJson');

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

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

function queryParams(event) {
  const q = (event && event.queryStringParameters) || {};
  return q;
}

/**
 * @param {string} method
 * @param {string} path
 */
function matchWidgetsStatsRoute(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '');
  if (m === 'GET' && p === '/widgets/stats') return 'GET /widgets/stats';
  if (m === 'GET' && /^\/widgets\/[^/]+\/stats$/.test(p)) {
    return 'GET /widgets/{widgetGuid}/stats';
  }
  return null;
}

function guidFromPath(path) {
  const m = String(path).match(/^\/widgets\/([^/]+)\/stats$/);
  return m ? m[1] : '';
}

function periodBounds(query, nowMs) {
  const now = new Date(nowMs);
  const to = now.toISOString().slice(0, 10);
  if (query.from && query.to) {
    return { from: String(query.from), to: String(query.to) };
  }
  const period = String(query.period || '30d').toLowerCase();
  let days = 30;
  if (period === '7d') days = 7;
  else if (period === '90d') days = 90;
  const from = new Date(nowMs - days * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handleWidgetsStats(event, deps = {}) {
  const envMap = deps.env || process.env;
  const verify = deps.verifyAuthorization || verifyAuthorization;
  const authHeader =
    headerGet(event && event.headers, 'authorization') ||
    headerGet(event && event.headers, 'Authorization');
  let userId;
  try {
    const auth = await verify(authHeader, { env: envMap, body: undefined });
    userId = auth.userId;
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse(401, { error: err.code });
    }
    return jsonResponse(401, { error: 'unauthorized' });
  }

  const path = String(
    (event && event.rawPath) ||
      (event &&
        event.requestContext &&
        event.requestContext.http &&
        event.requestContext.http.path) ||
      (event && event.path) ||
      '',
  );
  const query = queryParams(event);
  const nowMs = deps.nowMs != null ? Number(deps.nowMs) : Date.now();
  const { from, to } = periodBounds(query, nowMs);
  const store = deps.store || getDefaultCustomersStore();
  const statsStore = deps.statsStore || getDefaultWidgetStatsStore();
  const widgetEnv =
    deps.widgetEnv ||
    (envMap.A_SEARCH_WIDGET_ENV === 'live' ? 'live' : 'sandbox');

  let host = query.host != null ? String(query.host) : '';
  const singleGuid = guidFromPath(path);
  if (singleGuid) {
    const w = getWidget(store, singleGuid);
    if (!w || !w.host) {
      return jsonResponse(404, { error: 'widget_not_found' });
    }
    host = w.host;
  }
  if (!host) {
    return jsonResponse(400, { error: 'host_required' });
  }
  let hostKey;
  try {
    hostKey = normalizeHost(host);
  } catch {
    return jsonResponse(400, { error: 'host_required' });
  }

  const authorize =
    typeof deps.authorizeHost === 'function'
      ? deps.authorizeHost
      : () => true;
  const okAuth = await authorize({ userId, host: hostKey, store });
  if (!okAuth) {
    return jsonResponse(403, { error: 'forbidden' });
  }

  const cust = getCustomerByHost(store, hostKey);
  const customerNumber = cust ? String(cust.customerNumber) : '';
  let guids = [];
  if (singleGuid) {
    guids = [String(singleGuid).toLowerCase()];
  } else if (customerNumber) {
    guids = listActiveWidgets(store, customerNumber).map((w) =>
      String(w.widgetGuid).toLowerCase(),
    );
  }

  const widgets = [];
  let totalsViews = 0;
  let totalsImp = 0;
  let totalsClicks = 0;
  for (const g of guids) {
    const rows = statsStore.listDaily({
      env: widgetEnv,
      widgetGuid: g,
      fromDay: from,
      toDay: to,
    });
    let views = 0;
    let partImpressions = 0;
    let clicks = 0;
    const partsMap = new Map();
    const dailyMap = new Map();
    for (const r of rows) {
      const d = dailyMap.get(r.day) || { day: r.day, views: 0, clicks: 0 };
      if (r.partNumber === '') {
        views += Number(r.views) || 0;
        clicks += Number(r.clicks) || 0;
        d.views += Number(r.views) || 0;
        d.clicks += Number(r.clicks) || 0;
      } else {
        partImpressions += Number(r.partImpressions) || 0;
        const p = partsMap.get(r.partNumber) || {
          partNumber: r.partNumber,
          title: null,
          impressions: 0,
          clicks: 0,
        };
        p.impressions += Number(r.partImpressions) || 0;
        p.clicks += Number(r.clicks) || 0;
        partsMap.set(r.partNumber, p);
      }
      dailyMap.set(r.day, d);
    }
    const wrow = getWidget(store, g);
    widgets.push({
      widgetGuid: g,
      layout: wrow && wrow.layout ? wrow.layout : null,
      views,
      partImpressions,
      clicks,
      ctr: ctr(clicks, views),
      daily: [...dailyMap.values()].sort((a, b) =>
        a.day < b.day ? -1 : a.day > b.day ? 1 : 0,
      ),
      parts: [...partsMap.values()].map((p) => ({
        ...p,
        ctr: ctr(p.clicks, p.impressions),
      })),
    });
    totalsViews += views;
    totalsImp += partImpressions;
    totalsClicks += clicks;
  }

  return jsonResponse(200, {
    host: hostKey,
    from,
    to,
    totals: {
      views: totalsViews,
      partImpressions: totalsImp,
      clicks: totalsClicks,
      ctr: ctr(totalsClicks, totalsViews),
    },
    widgets,
  });
}

module.exports = {
  matchWidgetsStatsRoute,
  handleWidgetsStats,
  periodBounds,
};
