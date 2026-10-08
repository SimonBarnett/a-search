'use strict';

/**
 * Top links / merchants for JWT userId (FR-053e).
 * Scoped to userId + env. Date filter is out of scope (FR-053f).
 *
 * Event shape (partial ok):
 *   { userId, env, linkId?, merchantId?, merchantName?, clicks?, sales? }
 */

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
 * @param {{ userId: string, env: string, limit?: number }} want
 * @returns {{
 *   topLinks: Array<{ linkId: string, clicks: number, sales: number }>,
 *   topMerchants: Array<{ merchantId: string, merchantName: string, clicks: number, sales: number }>,
 * }}
 */
function aggregateTopEvents(events, want) {
  const rows = Array.isArray(events) ? events : [];
  const limit =
    want.limit != null && Number(want.limit) > 0 ? Number(want.limit) : 10;

  /** @type {Map<string, { linkId: string, clicks: number, sales: number }>} */
  const links = new Map();
  /** @type {Map<string, { merchantId: string, merchantName: string, clicks: number, sales: number }>} */
  const merchants = new Map();

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    if (String(row.userId) !== String(want.userId)) continue;
    if (String(row.env) !== String(want.env)) continue;

    const clicks = num(row.clicks);
    const sales = num(row.sales);

    if (row.linkId != null && String(row.linkId).trim() !== '') {
      const linkId = String(row.linkId).trim();
      let L = links.get(linkId);
      if (!L) {
        L = { linkId, clicks: 0, sales: 0 };
        links.set(linkId, L);
      }
      L.clicks += clicks;
      L.sales += sales;
    }

    if (row.merchantId != null && String(row.merchantId).trim() !== '') {
      const merchantId = String(row.merchantId).trim();
      let M = merchants.get(merchantId);
      if (!M) {
        M = {
          merchantId,
          merchantName:
            row.merchantName != null
              ? String(row.merchantName)
              : merchantId,
          clicks: 0,
          sales: 0,
        };
        merchants.set(merchantId, M);
      }
      M.clicks += clicks;
      M.sales += sales;
      if (row.merchantName != null && String(row.merchantName).trim() !== '') {
        M.merchantName = String(row.merchantName);
      }
    }
  }

  const sortDesc = (a, b) => {
    if (b.clicks !== a.clicks) return b.clicks - a.clicks;
    if (b.sales !== a.sales) return b.sales - a.sales;
    const ak = a.linkId || a.merchantId || '';
    const bk = b.linkId || b.merchantId || '';
    return String(ak).localeCompare(String(bk));
  };

  const topLinks = [...links.values()].sort(sortDesc).slice(0, limit);
  const topMerchants = [...merchants.values()].sort(sortDesc).slice(0, limit);

  return { topLinks, topMerchants };
}

/**
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.env
 * @param {number} [opts.limit]
 * @param {object[]} [opts.events]
 * @param {Function} [opts.listEvents]
 */
async function aggregateTop(opts = {}) {
  const userId = opts.userId == null ? '' : String(opts.userId);
  const env = opts.env;
  if (!userId) {
    return { topLinks: [], topMerchants: [] };
  }

  let events = opts.events;
  if (!Array.isArray(events) && typeof opts.listEvents === 'function') {
    events = await opts.listEvents({ userId, env, limit: opts.limit });
  }
  if (!Array.isArray(events)) {
    events = [];
  }

  return aggregateTopEvents(events, {
    userId,
    env,
    limit: opts.limit,
  });
}

module.exports = {
  aggregateTop,
  aggregateTopEvents,
};
