'use strict';

/**
 * Magento REST catalogue (FR-243). OAuth 1.0a signed GET /rest/V1/products.
 * Default: configurable parent with min price (documented in skillbook).
 */

const { signOAuth1 } = require('./oauth1');

/**
 * @param {{
 *   storeBaseUrl: string,
 *   consumerKey: string,
 *   consumerSecret: string,
 *   accessToken: string,
 *   accessTokenSecret: string,
 *   httpRequest: Function,
 *   page?: number,
 *   pageSize?: number,
 *   storeCode?: string,
 * }} opts
 */
async function fetchProductsPage(opts) {
  const origin = String(opts.storeBaseUrl || '').replace(/\/$/, '');
  const page = opts.page != null ? Number(opts.page) : 1;
  const pageSize = opts.pageSize != null ? Number(opts.pageSize) : 100;
  const prefix = opts.storeCode
    ? `${origin}/rest/${opts.storeCode}/V1`
    : `${origin}/rest/V1`;
  const params = {
    'searchCriteria[pageSize]': String(pageSize),
    'searchCriteria[currentPage]': String(page),
    'searchCriteria[filterGroups][0][filters][0][field]': 'status',
    'searchCriteria[filterGroups][0][filters][0][value]': '1',
    'searchCriteria[filterGroups][0][filters][0][condition_type]': 'eq',
  };
  const qs = new URLSearchParams(params).toString();
  const url = `${prefix}/products?${qs}`;
  const signed = signOAuth1({
    method: 'GET',
    url,
    consumerKey: opts.consumerKey,
    consumerSecret: opts.consumerSecret,
    token: opts.accessToken,
    tokenSecret: opts.accessTokenSecret,
  });
  const res = await opts.httpRequest({
    method: 'GET',
    url,
    headers: {
      Authorization: signed.authorization,
      Accept: 'application/json',
    },
  });
  const status = Number(res && res.statusCode) || 0;
  if (status === 401) {
    const err = new Error('magento_unauthorized');
    err.code = 'magento_unauthorized';
    throw err;
  }
  if (status === 429 || status === 503) {
    const err = new Error('rate_limited');
    err.code = 'rate_limited';
    throw err;
  }
  if (status < 200 || status >= 300) {
    const err = new Error('magento_catalog_failed');
    err.code = 'magento_catalog_failed';
    err.httpStatus = status;
    throw err;
  }
  const body =
    res.body && typeof res.body === 'object'
      ? res.body
      : JSON.parse(String((res && res.body) || '{}'));
  const items = Array.isArray(body.items) ? body.items : [];
  const total = Number(body.total_count != null ? body.total_count : items.length);
  return { items, total, page, pageSize };
}

/**
 * @param {object} opts fetchProductsPage opts + maxPages
 */
async function fetchAllProducts(opts) {
  const pageSize = opts.pageSize != null ? Number(opts.pageSize) : 100;
  const maxPages = opts.maxPages != null ? Number(opts.maxPages) : 50;
  const all = [];
  let page = 1;
  let total = Infinity;
  while (page <= maxPages && all.length < total) {
    const r = await fetchProductsPage({ ...opts, page, pageSize });
    all.push(...r.items);
    total = r.total;
    if (r.items.length < pageSize) break;
    page += 1;
  }
  return { products: all, pages: page };
}

module.exports = {
  fetchProductsPage,
  fetchAllProducts,
};
