'use strict';

/**
 * Ecwid Catalog API v3 (FR-246).
 * GET /api/v3/{storeId}/products?enabled=true&limit=100&offset=N
 */

const DEFAULT_API_BASE = 'https://app.ecwid.com/api/v3';
const DEFAULT_LIMIT = 100;

/**
 * @param {{
 *   storeId: string,
 *   accessToken: string,
 *   httpRequest: Function,
 *   offset?: number,
 *   limit?: number,
 *   apiBase?: string,
 *   sleepMs?: (ms: number) => Promise<void>,
 * }} opts
 */
async function fetchProductsPage(opts) {
  const storeId = String(opts.storeId || '').trim();
  const accessToken = String(opts.accessToken || '').trim();
  if (!storeId || !accessToken) {
    const err = new Error('ecwid_credentials_missing');
    err.code = 'ecwid_credentials_missing';
    throw err;
  }
  const offset = opts.offset != null ? Number(opts.offset) : 0;
  const limit = opts.limit != null ? Number(opts.limit) : DEFAULT_LIMIT;
  const base = String(opts.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
  const params = new URLSearchParams({
    enabled: 'true',
    limit: String(limit),
    offset: String(offset),
  });
  const url = `${base}/${encodeURIComponent(storeId)}/products?${params}`;
  const res = await opts.httpRequest({
    method: 'GET',
    url,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  const status = Number(res && res.statusCode) || 0;
  if (status === 401) {
    const err = new Error('ecwid_unauthorized');
    err.code = 'ecwid_unauthorized';
    throw err;
  }
  if (status === 429 || status === 503) {
    const headers = (res && res.headers) || {};
    const retryAfter = Number(
      headers['retry-after'] || headers['Retry-After'] || 1,
    );
    const sleepMs = Math.max(1, retryAfter) * 1000;
    if (typeof opts.sleepMs === 'function') {
      await opts.sleepMs(sleepMs);
    }
    const err = new Error('rate_limited');
    err.code = 'rate_limited';
    err.retryAfterSec = retryAfter;
    throw err;
  }
  if (status < 200 || status >= 300) {
    const err = new Error('ecwid_catalog_failed');
    err.code = 'ecwid_catalog_failed';
    err.httpStatus = status;
    throw err;
  }
  const body =
    res.body && typeof res.body === 'object'
      ? res.body
      : JSON.parse(String((res && res.body) || '{}'));
  const items = Array.isArray(body.items) ? body.items : [];
  const total = Number(body.total != null ? body.total : items.length);
  return { items, total, offset, limit, count: items.length };
}

/**
 * @param {object} opts fetchProductsPage opts + maxPages
 */
async function fetchAllProducts(opts) {
  const limit = opts.limit != null ? Number(opts.limit) : DEFAULT_LIMIT;
  const maxPages = opts.maxPages != null ? Number(opts.maxPages) : 50;
  const all = [];
  let offset = 0;
  let page = 0;
  let total = Infinity;
  while (page < maxPages && all.length < total) {
    const r = await fetchProductsPage({ ...opts, offset, limit });
    all.push(...r.items);
    total = r.total;
    page += 1;
    if (r.items.length < limit) break;
    offset += limit;
  }
  return { products: all, pages: page };
}

module.exports = {
  DEFAULT_API_BASE,
  DEFAULT_LIMIT,
  fetchProductsPage,
  fetchAllProducts,
};
