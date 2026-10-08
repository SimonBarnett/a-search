'use strict';

/**
 * WooCommerce REST catalogue client (FR-109).
 * Lists store products via GET /wp-json/wc/v3/products.
 * HTTP is injectable for recorded fixtures; stay-dark (registry enabled false).
 */

const DEFAULT_API_PREFIX = '/wp-json/wc/v3';

class WooCommerceCredsError extends Error {
  /**
   * @param {string} [message]
   * @param {string} [code]
   */
  constructor(message, code) {
    super(message || 'woocommerce_missing_credentials');
    this.name = 'WooCommerceCredsError';
    this.code = code || 'woocommerce_missing_credentials';
  }
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function readWooCommerceCreds(env) {
  const e = env || process.env;
  const storeUrl =
    e.WOOCOMMERCE_STORE_URL != null
      ? String(e.WOOCOMMERCE_STORE_URL).trim()
      : '';
  const consumerKey =
    e.WOOCOMMERCE_CONSUMER_KEY != null
      ? String(e.WOOCOMMERCE_CONSUMER_KEY).trim()
      : '';
  const consumerSecret =
    e.WOOCOMMERCE_CONSUMER_SECRET != null
      ? String(e.WOOCOMMERCE_CONSUMER_SECRET).trim()
      : '';
  const apiPrefix =
    e.WOOCOMMERCE_API_PREFIX != null && String(e.WOOCOMMERCE_API_PREFIX).trim()
      ? String(e.WOOCOMMERCE_API_PREFIX).trim()
      : DEFAULT_API_PREFIX;
  return { storeUrl, consumerKey, consumerSecret, apiPrefix };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function assertWooCommerceCreds(env) {
  const c = readWooCommerceCreds(env);
  const missing = [];
  if (!c.storeUrl) missing.push('WOOCOMMERCE_STORE_URL');
  if (!c.consumerKey) missing.push('WOOCOMMERCE_CONSUMER_KEY');
  if (!c.consumerSecret) missing.push('WOOCOMMERCE_CONSUMER_SECRET');
  if (missing.length) {
    throw new WooCommerceCredsError(
      `WooCommerce REST API credentials missing: ${missing.join(', ')}. Set them in providers/local/woocommerce/.env (never commit).`,
    );
  }
  return c;
}

/**
 * Normalize store origin (scheme + host[+port], no trailing slash).
 * @param {string} storeUrl
 * @returns {string}
 */
function storeOriginFromUrl(storeUrl) {
  let raw = String(storeUrl || '').trim();
  if (!raw) {
    throw new WooCommerceCredsError(
      'WOOCOMMERCE_STORE_URL is empty',
      'woocommerce_bad_store_url',
    );
  }
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new WooCommerceCredsError(
      `WOOCOMMERCE_STORE_URL is not a valid URL: ${storeUrl}`,
      'woocommerce_bad_store_url',
    );
  }
  if (!u.hostname) {
    throw new WooCommerceCredsError(
      `WOOCOMMERCE_STORE_URL has no host: ${storeUrl}`,
      'woocommerce_bad_store_url',
    );
  }
  const port =
    u.port && u.port !== '443' && u.port !== '80' ? `:${u.port}` : '';
  return `${u.protocol}//${u.hostname.toLowerCase()}${port}`;
}

/**
 * Basic auth header value for WooCommerce REST (consumer key/secret).
 * @param {string} consumerKey
 * @param {string} consumerSecret
 */
function basicAuthHeader(consumerKey, consumerSecret) {
  const token = Buffer.from(
    `${consumerKey}:${consumerSecret}`,
    'utf8',
  ).toString('base64');
  return `Basic ${token}`;
}

/**
 * @param {string} storeUrl
 * @param {{
 *   apiPrefix?: string,
 *   page?: number,
 *   perPage?: number,
 *   consumerKey?: string,
 *   consumerSecret?: string,
 *   authInQuery?: boolean,
 * }} [opts]
 */
function buildProductsUrl(storeUrl, opts) {
  const origin = storeOriginFromUrl(storeUrl);
  const prefix = String(
    (opts && opts.apiPrefix) || DEFAULT_API_PREFIX,
  ).replace(/\/$/, '');
  const pathPrefix = prefix.startsWith('/') ? prefix : `/${prefix}`;
  const perPage = Math.min(
    100,
    Math.max(1, Number((opts && opts.perPage) || 50) || 50),
  );
  const page = Math.max(1, Number((opts && opts.page) || 1) || 1);
  const params = new URLSearchParams();
  params.set('per_page', String(perPage));
  params.set('page', String(page));
  if (opts && opts.authInQuery) {
    if (opts.consumerKey) params.set('consumer_key', String(opts.consumerKey));
    if (opts.consumerSecret) {
      params.set('consumer_secret', String(opts.consumerSecret));
    }
  }
  return `${origin}${pathPrefix}/products?${params.toString()}`;
}

/**
 * Default Node https JSON helper (GET).
 * @param {{ method?: string, url: string, headers?: object, body?: string }} req
 */
async function defaultHttpRequest(req) {
  const https = require('node:https');
  const { URL } = require('node:url');
  const u = new URL(req.url);
  const headers = Object.assign({}, req.headers || {});
  return new Promise((resolve, reject) => {
    const r = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: req.method || 'GET',
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let body = text;
          try {
            body = text ? JSON.parse(text) : {};
          } catch {
            /* keep text */
          }
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers || {},
            body,
          });
        });
      },
    );
    r.on('error', reject);
    if (req.body != null) r.write(String(req.body));
    r.end();
  });
}

/**
 * Map one WooCommerce REST product into Parts-shaped staging fields.
 * @param {object} product
 * @param {{ source?: string, env?: string, feedKey?: string }} [meta]
 */
function normalizeWooCommerceProduct(product, meta) {
  const p = product || {};
  const images = Array.isArray(p.images) ? p.images : [];
  const img0 = images[0] || {};
  const id =
    p.id != null
      ? String(p.id)
      : p.sku != null && String(p.sku).trim()
        ? String(p.sku).trim()
        : p.slug != null
          ? String(p.slug)
          : '';
  const title =
    p.name != null
      ? String(p.name)
      : p.title != null
        ? String(p.title)
        : '';
  let price;
  const priceRaw =
    p.price != null && String(p.price).trim() !== ''
      ? p.price
      : p.regular_price;
  if (priceRaw != null && String(priceRaw).trim() !== '') {
    const n = Number(priceRaw);
    price = Number.isFinite(n) ? n : undefined;
  }
  const currency =
    p.currency != null && String(p.currency).trim()
      ? String(p.currency).trim()
      : undefined;
  let stock;
  if (p.stock_quantity != null) {
    stock = String(p.stock_quantity);
  } else if (p.stock_status != null) {
    stock = String(p.stock_status);
  }
  const permalink =
    p.permalink != null && String(p.permalink).trim()
      ? String(p.permalink).trim()
      : undefined;
  const relative =
    !permalink && p.slug
      ? `/product/${p.slug}`
      : undefined;
  return {
    Source: (meta && meta.source) || 'woocommerce',
    Env: (meta && meta.env) || undefined,
    FeedKey: (meta && meta.feedKey) || undefined,
    MerchantProductId: id,
    Title: title,
    Description:
      p.description != null
        ? String(p.description)
        : p.short_description != null
          ? String(p.short_description)
          : undefined,
    Url: permalink || relative,
    ImageUrl: img0.src != null ? String(img0.src) : undefined,
    Price: price,
    Currency: currency,
    Stock: stock,
    Raw: {
      woocommerceProductId: p.id,
      slug: p.slug,
      sku: p.sku,
      status: p.status,
    },
  };
}

/**
 * @param {object|array} body WooCommerce products payload
 * @param {{ source?: string, env?: string, feedKey?: string }} [meta]
 */
function parseProductsResponse(body, meta) {
  const products = Array.isArray(body)
    ? body
    : body && Array.isArray(body.products)
      ? body.products
      : [];
  const rows = [];
  for (const p of products) {
    const row = normalizeWooCommerceProduct(p, meta);
    if (!row.MerchantProductId || !row.Title) continue;
    rows.push(row);
  }
  return rows;
}

/**
 * Fetch one WooCommerce products page (injectable HTTP).
 * @param {object} [deps]
 * @param {Record<string, string|undefined>} [deps.env]
 * @param {(req: object) => Promise<object>} [deps.httpRequest]
 * @param {number} [deps.perPage]
 * @param {number} [deps.page]
 * @param {boolean} [deps.authInQuery] put consumer_key/secret in query (http stores)
 * @param {string} [deps.envName] Parts Env column
 * @param {string} [deps.feedKey]
 */
async function fetchCatalogPage(deps) {
  const envVars = (deps && deps.env) || process.env;
  const creds = assertWooCommerceCreds(envVars);
  const authInQuery = Boolean(deps && deps.authInQuery);
  const url = buildProductsUrl(creds.storeUrl, {
    apiPrefix: creds.apiPrefix,
    perPage: deps && deps.perPage,
    page: deps && deps.page,
    consumerKey: creds.consumerKey,
    consumerSecret: creds.consumerSecret,
    authInQuery,
  });
  const http =
    deps && typeof deps.httpRequest === 'function'
      ? deps.httpRequest
      : defaultHttpRequest;
  /** @type {Record<string, string>} */
  const headers = {
    Accept: 'application/json',
  };
  if (!authInQuery) {
    headers.Authorization = basicAuthHeader(
      creds.consumerKey,
      creds.consumerSecret,
    );
  }
  const res = await http({
    method: 'GET',
    url,
    headers,
  });
  let payload = res;
  let status = 200;
  if (res && typeof res === 'object' && 'body' in res && 'statusCode' in res) {
    status = Number(res.statusCode) || 0;
    payload = res.body;
  }
  if (status && (status < 200 || status >= 300)) {
    throw new WooCommerceCredsError(
      `WooCommerce REST API HTTP ${status}`,
      'woocommerce_http_error',
    );
  }
  const meta = {
    source: 'woocommerce',
    env: deps && deps.envName,
    feedKey: deps && deps.feedKey,
  };
  return {
    ok: true,
    source: 'woocommerce',
    url,
    products: parseProductsResponse(payload, meta),
    raw: payload,
  };
}

module.exports = {
  DEFAULT_API_PREFIX,
  WooCommerceCredsError,
  readWooCommerceCreds,
  assertWooCommerceCreds,
  storeOriginFromUrl,
  basicAuthHeader,
  buildProductsUrl,
  defaultHttpRequest,
  normalizeWooCommerceProduct,
  parseProductsResponse,
  fetchCatalogPage,
};
