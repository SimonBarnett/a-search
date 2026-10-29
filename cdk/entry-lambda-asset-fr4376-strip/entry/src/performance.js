'use strict';

/**
 * Account performance payload helpers (FR-053b stub + FR-053c clicks/visits).
 * emptyPerformancePayload starts at zeros; handler fills clicks/visits via
 * performanceClicksVisits. Sales remain stub until FR-053d.
 */

const { AuthError } = require('./auth/jwt');

/**
 * @param {string} userId
 * @param {{ env: string, from: string, to: string }} range
 */
function emptyPerformancePayload(userId, range) {
  return {
    ok: true,
    userId: String(userId),
    env: range.env,
    from: range.from,
    to: range.to,
    clicks: 0,
    visits: 0,
    uniqueVisitors: 0,
    sales: {
      count: 0,
      amount: 0,
      commission: 0,
      currency: 'GBP',
    },
    currencies: [],
    topLinks: [],
    topMerchants: [],
  };
}

/**
 * @param {string|undefined} raw
 * @returns {string|null} yyyy-MM-dd or null if invalid
 */
function parseDay(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.toISOString().slice(0, 10) !== s) return null;
  return s;
}

/**
 * Default range: last 7 UTC days ending today (inclusive).
 * @param {Date} [now]
 */
function defaultRange(now = new Date()) {
  const to = now.toISOString().slice(0, 10);
  const fromDate = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const from = fromDate.toISOString().slice(0, 10);
  return { from, to };
}

/**
 * @param {object} query
 * @param {object} body
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
function resolvePerformanceInput(query = {}, body = {}) {
  const sandbox =
    body.sandbox === true ||
    query.sandbox === true ||
    query.sandbox === 'true';
  const env = sandbox ? 'sandbox' : 'live';

  const def = defaultRange();
  const fromRaw = body.from != null ? body.from : query.from;
  const toRaw = body.to != null ? body.to : query.to;
  const from = fromRaw == null || fromRaw === '' ? def.from : parseDay(fromRaw);
  const to = toRaw == null || toRaw === '' ? def.to : parseDay(toRaw);
  if (!from || !to) {
    return { ok: false, error: 'invalid_date_range' };
  }
  if (from > to) {
    return { ok: false, error: 'invalid_date_range' };
  }
  return { ok: true, value: { env, from, to } };
}

/**
 * @param {object} event
 * @returns {Record<string, string>}
 */
function queryParams(event) {
  const q =
    (event && event.queryStringParameters) ||
    (event && event.rawQueryString
      ? Object.fromEntries(new URLSearchParams(event.rawQueryString))
      : {}) ||
    {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(q)) {
    if (v != null) out[k] = String(v);
  }
  return out;
}

module.exports = {
  emptyPerformancePayload,
  resolvePerformanceInput,
  queryParams,
  parseDay,
  defaultRange,
  AuthError,
};
