'use strict';

/**
 * Aggregate clicks / visits for JWT userId (FR-053c).
 * Sales/commission are out of scope (FR-053d).
 *
 * Read model: injectable event list (MSSQL/mapping later). Each event:
 *   { userId, env, type: 'click'|'visit', at: ISO-8601, visitorId? }
 */

/**
 * @param {string|Date} day
 * @returns {string} yyyy-MM-dd UTC
 */
function eventDay(day) {
  if (day instanceof Date) return day.toISOString().slice(0, 10);
  const s = String(day).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new Error('invalid_day');
  }
  return d.toISOString().slice(0, 10);
}

/**
 * @param {string} at
 * @param {string} from
 * @param {string} to
 */
function inRange(at, from, to) {
  let day;
  try {
    day = eventDay(at);
  } catch {
    return false;
  }
  return day >= from && day <= to;
}

/**
 * @param {object[]} events
 * @param {{ userId: string, env: string, from: string, to: string }} want
 * @returns {{ clicks: number, visits: number, uniqueVisitors: number }}
 */
function aggregateClickVisitEvents(events, want) {
  const rows = Array.isArray(events) ? events : [];
  let clicks = 0;
  let visits = 0;
  /** @type {Set<string>} */
  const visitors = new Set();

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    if (String(row.userId) !== String(want.userId)) continue;
    if (String(row.env) !== String(want.env)) continue;
    if (!inRange(row.at, want.from, want.to)) continue;

    const type = String(row.type || '').toLowerCase();
    if (type === 'click') {
      clicks += 1;
      if (row.visitorId != null && String(row.visitorId).trim() !== '') {
        visitors.add(String(row.visitorId));
      }
    } else if (type === 'visit') {
      visits += 1;
      if (row.visitorId != null && String(row.visitorId).trim() !== '') {
        visitors.add(String(row.visitorId));
      }
    }
  }

  return {
    clicks,
    visits,
    uniqueVisitors: visitors.size,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.env
 * @param {string} opts.from
 * @param {string} opts.to
 * @param {object[]} [opts.events]
 * @param {Function} [opts.listEvents]
 * @returns {Promise<{ clicks: number, visits: number, uniqueVisitors: number }>}
 */
async function aggregateClicksVisits(opts = {}) {
  const userId = opts.userId == null ? '' : String(opts.userId);
  const env = opts.env;
  const from = opts.from;
  const to = opts.to;
  if (!userId) {
    return { clicks: 0, visits: 0, uniqueVisitors: 0 };
  }

  let events = opts.events;
  if (!Array.isArray(events) && typeof opts.listEvents === 'function') {
    events = await opts.listEvents({ userId, env, from, to });
  }
  if (!Array.isArray(events)) {
    events = [];
  }

  return aggregateClickVisitEvents(events, { userId, env, from, to });
}

module.exports = {
  aggregateClicksVisits,
  aggregateClickVisitEvents,
  eventDay,
};
