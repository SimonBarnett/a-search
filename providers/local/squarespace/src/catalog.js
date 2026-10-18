'use strict';

/**
 * Squarespace Commerce catalogue client (FR-242).
 * GET /v2/commerce/products with Bearer token + User-Agent; cursor pagination.
 */

const DEFAULT_API_BASE = 'https://api.squarespace.com';
const USER_AGENT = 'a-search-squarespace/1.0 (+https://smartcatalogue.uk)';

class SquarespaceCredsError extends Error {
  constructor(message, code) {
    super(message || 'squarespace_missing_credentials');
    this.name = 'SquarespaceCredsError';
    this.code = code || 'squarespace_missing_credentials';
  }
}

/**
 * @param {Record<string, string|undefined>} [env]
 * @param {{ accessToken?: string, apiKey?: string, apiBase?: string }} [overrides]
 */
function readSquarespaceCreds(env, overrides) {
  const e = env || process.env;
  const o = overrides || {};
  const accessToken =
    o.accessToken != null && String(o.accessToken).trim()
      ? String(o.accessToken).trim()
      : o.apiKey != null && String(o.apiKey).trim()
        ? String(o.apiKey).trim()
        : e.SQUARESPACE_ACCESS_TOKEN != null
          ? String(e.SQUARESPACE_ACCESS_TOKEN).trim()
          : e.SQUARESPACE_API_KEY != null
            ? String(e.SQUARESPACE_API_KEY).trim()
            : '';
  const apiBase =
    o.apiBase != null && String(o.apiBase).trim()
      ? String(o.apiBase).trim().replace(/\/$/, '')
      : e.SQUARESPACE_API_BASE != null && String(e.SQUARESPACE_API_BASE).trim()
        ? String(e.SQUARESPACE_API_BASE).trim().replace(/\/$/, '')
        : DEFAULT_API_BASE;
  return { accessToken, apiBase };
}

function assertSquarespaceCreds(env, overrides) {
  const c = readSquarespaceCreds(env, overrides);
  if (!c.accessToken) {
    throw new SquarespaceCredsError(
      'Squarespace credentials missing: SQUARESPACE_ACCESS_TOKEN or API key.',
    );
  }
  return c;
}

/**
 * @param {{
 *   httpRequest?: Function,
 *   accessToken: string,
 *   apiBase?: string,
 *   cursor?: string|null,
 *   modifiedAfter?: string,
 *   modifiedBefore?: string,
 *   limit?: number,
 * }} opts
 */
async function fetchProductsPage(opts) {
  const creds = assertSquarespaceCreds(process.env, {
    accessToken: opts.accessToken,
    apiBase: opts.apiBase,
  });
  const httpRequest =
    typeof opts.httpRequest === 'function'
      ? opts.httpRequest
      : async () => {
          throw new Error('httpRequest_required');
        };
  const params = new URLSearchParams();
  params.set('limit', String(opts.limit != null ? opts.limit : 50));
  if (opts.cursor) params.set('cursor', String(opts.cursor));
  if (opts.modifiedAfter) params.set('modifiedAfter', String(opts.modifiedAfter));
  if (opts.modifiedBefore) {
    params.set('modifiedBefore', String(opts.modifiedBefore));
  }
  const url = `${creds.apiBase}/v2/commerce/products?${params.toString()}`;
  const res = await httpRequest({
    method: 'GET',
    url,
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  });
  const status = Number(res && res.statusCode) || 0;
  if (status === 429) {
    const err = new Error('rate_limited');
    err.code = 'rate_limited';
    err.retryAfter = (res.headers && (res.headers['retry-after'] || res.headers['Retry-After'])) || null;
    throw err;
  }
  if (status < 200 || status >= 300) {
    const err = new Error('squarespace_catalog_failed');
    err.code = 'squarespace_catalog_failed';
    err.httpStatus = status;
    throw err;
  }
  const body =
    res.body && typeof res.body === 'object'
      ? res.body
      : JSON.parse(String((res && res.body) || '{}'));
  const products = Array.isArray(body.products)
    ? body.products
    : Array.isArray(body.result)
      ? body.result
      : [];
  const nextCursor =
    (body.pagination && body.pagination.nextPageCursor) ||
    body.cursor ||
    body.nextPageCursor ||
    null;
  return { products, nextCursor, raw: body };
}

/**
 * Walk cursor pages until exhausted (injectable HTTP).
 * @param {object} opts same as fetchProductsPage + maxPages
 */
async function fetchAllProducts(opts) {
  const all = [];
  let cursor = opts.cursor || null;
  let pages = 0;
  const maxPages = opts.maxPages != null ? Number(opts.maxPages) : 100;
  do {
    const page = await fetchProductsPage({ ...opts, cursor });
    all.push(...page.products);
    cursor = page.nextCursor;
    pages += 1;
  } while (cursor && pages < maxPages);
  return { products: all, pages };
}

module.exports = {
  DEFAULT_API_BASE,
  USER_AGENT,
  SquarespaceCredsError,
  readSquarespaceCreds,
  assertSquarespaceCreds,
  fetchProductsPage,
  fetchAllProducts,
};
