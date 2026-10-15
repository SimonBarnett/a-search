'use strict';

/**
 * BigCommerce Catalog API v3 (FR-245).
 * GET /stores/{store_hash}/v3/catalog/products with X-Auth-Token.
 */

const DEFAULT_API_BASE = 'https://api.bigcommerce.com';
const DEFAULT_LIMIT = 250;

/**
 * @param {{
 *   storeHash: string,
 *   accessToken: string,
 *   httpRequest: Function,
 *   page?: number,
 *   limit?: number,
 *   apiBase?: string,
 *   sleepMs?: (ms: number) => Promise<void>,
 * }} opts
 */
async function fetchProductsPage(opts) {
  const storeHash = String(opts.storeHash || '').trim();
  const accessToken = String(opts.accessToken || '').trim();
  if (!storeHash || !accessToken) {
    const err = new Error('bigcommerce_credentials_missing');
    err.code = 'bigcommerce_credentials_missing';
    throw err;
  }
  const page = opts.page != null ? Number(opts.page) : 1;
  const limit = opts.limit != null ? Number(opts.limit) : DEFAULT_LIMIT;
  const base = String(opts.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
  const params = new URLSearchParams({
    include: 'variants,images,primary_image',
    is_visible: 'true',
    limit: String(limit),
    page: String(page),
  });
  const url = `${base}/stores/${storeHash}/v3/catalog/products?${params}`;
  const res = await opts.httpRequest({
    method: 'GET',
    url,
    headers: {
      'X-Auth-Token': accessToken,
      Accept: 'application/json',
    },
  });
  const status = Number(res && res.statusCode) || 0;
  if (status === 401) {
    const err = new Error('bigcommerce_unauthorized');
    err.code = 'bigcommerce_unauthorized';
    throw err;
  }
  if (status === 429 || status === 503) {
    const headers = (res && res.headers) || {};
    const resetMs = Number(
      headers['x-rate-limit-time-reset-ms'] ||
        headers['X-Rate-Limit-Time-Reset-Ms'] ||
        1000,
    );
    if (typeof opts.sleepMs === 'function' && resetMs > 0) {
      await opts.sleepMs(resetMs);
    }
    const err = new Error('rate_limited');
    err.code = 'rate_limited';
    err.resetMs = resetMs;
    throw err;
  }
  if (status < 200 || status >= 300) {
    const err = new Error('bigcommerce_catalog_failed');
    err.code = 'bigcommerce_catalog_failed';
    err.httpStatus = status;
    throw err;
  }
  const body =
    res.body && typeof res.body === 'object'
      ? res.body
      : JSON.parse(String((res && res.body) || '{}'));
  const items = Array.isArray(body.data) ? body.data : [];
  const pagination =
    (body.meta && body.meta.pagination) || body.pagination || {};
  const totalPages = Number(pagination.total_pages || 1);
  const total = Number(
    pagination.total != null ? pagination.total : items.length,
  );
  return { items, total, page, limit, totalPages, headers: res.headers || {} };
}

/**
 * @param {object} opts fetchProductsPage opts + maxPages
 */
async function fetchAllProducts(opts) {
  const limit = opts.limit != null ? Number(opts.limit) : DEFAULT_LIMIT;
  const maxPages = opts.maxPages != null ? Number(opts.maxPages) : 50;
  const all = [];
  let page = 1;
  let totalPages = 1;
  while (page <= maxPages && page <= totalPages) {
    const r = await fetchProductsPage({ ...opts, page, limit });
    all.push(...r.items);
    totalPages = r.totalPages || 1;
    if (r.items.length < limit) break;
    page += 1;
  }
  return { products: all, pages: page };
}

module.exports = {
  DEFAULT_API_BASE,
  DEFAULT_LIMIT,
  fetchProductsPage,
  fetchAllProducts,
};
