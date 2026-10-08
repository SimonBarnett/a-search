'use strict';

/**
 * Aggregate sales / commission by currency for JWT userId (FR-053d).
 * Top merchants/links are out of scope (FR-053e).
 *
 * Sale event shape:
 *   { userId, env, at: ISO-8601, amount, commission, currency }
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
 * @param {unknown} n
 * @returns {number}
 */
function num(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

/**
 * @param {object[]} events
 * @param {{ userId: string, env: string, from: string, to: string }} want
 * @returns {{
 *   sales: { count: number, amount: number, commission: number, currency: string },
 *   currencies: Array<{ currency: string, count: number, amount: number, commission: number }>,
 * }}
 */
function aggregateSaleEvents(events, want) {
  const rows = Array.isArray(events) ? events : [];
  /** @type {Map<string, { currency: string, count: number, amount: number, commission: number }>} */
  const byCurrency = new Map();
  let count = 0;
  let amount = 0;
  let commission = 0;

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    if (String(row.userId) !== String(want.userId)) continue;
    if (String(row.env) !== String(want.env)) continue;
    if (!inRange(row.at, want.from, want.to)) continue;

    const currency = String(row.currency || 'GBP').trim().toUpperCase() || 'GBP';
    const amt = num(row.amount);
    const comm = num(row.commission);
    count += 1;
    amount += amt;
    commission += comm;

    let bucket = byCurrency.get(currency);
    if (!bucket) {
      bucket = { currency, count: 0, amount: 0, commission: 0 };
      byCurrency.set(currency, bucket);
    }
    bucket.count += 1;
    bucket.amount += amt;
    bucket.commission += comm;
  }

  const currencies = [...byCurrency.values()].sort((a, b) =>
    a.currency.localeCompare(b.currency),
  );

  // Primary currency: highest amount, then alphabetical.
  let primary = 'GBP';
  if (currencies.length) {
    primary = currencies.reduce((best, cur) => {
      if (cur.amount > best.amount) return cur;
      if (cur.amount === best.amount && cur.currency < best.currency) return cur;
      return best;
    }).currency;
  }

  return {
    sales: {
      count,
      amount,
      commission,
      currency: primary,
    },
    currencies,
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
 */
async function aggregateSales(opts = {}) {
  const userId = opts.userId == null ? '' : String(opts.userId);
  const env = opts.env;
  const from = opts.from;
  const to = opts.to;
  if (!userId) {
    return {
      sales: { count: 0, amount: 0, commission: 0, currency: 'GBP' },
      currencies: [],
    };
  }

  let events = opts.events;
  if (!Array.isArray(events) && typeof opts.listEvents === 'function') {
    events = await opts.listEvents({ userId, env, from, to });
  }
  if (!Array.isArray(events)) {
    events = [];
  }

  return aggregateSaleEvents(events, { userId, env, from, to });
}

module.exports = {
  aggregateSales,
  aggregateSaleEvents,
  eventDay,
};
