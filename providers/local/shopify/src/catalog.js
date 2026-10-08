'use strict';

/**
 * Shopify Admin REST catalogue client (FR-101).
 * Lists store products via /admin/api/{version}/products.json.
 * HTTP is injectable for recorded fixtures; stay-dark (registry enabled false).
 */

const DEFAULT_API_VERSION = '2024-10';

class ShopifyCredsError extends Error {
  /**
   * @param {string} [message]
   * @param {string} [code]
   */
  constructor(message, code) {
    super(message || 'shopify_missing_credentials');
    this.name = 'ShopifyCredsError';
    this.code = code || 'shopify_missing_credentials';
  }
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function readShopifyCreds(env) {
  const e = env || process.env;
  const storeUrl =
    e.SHOPIFY_STORE_URL != null ? String(e.SHOPIFY_STORE_URL).trim() : '';
  const accessToken =
    e.SHOPIFY_ACCESS_TOKEN != null ? String(e.SHOPIFY_ACCESS_TOKEN).trim() : '';
  const apiVersion =
    e.SHOPIFY_API_VERSION != null && String(e.SHOPIFY_API_VERSION).trim()
      ? String(e.SHOPIFY_API_VERSION).trim()
      : DEFAULT_API_VERSION;
  return { storeUrl, accessToken, apiVersion };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function assertShopifyCreds(env) {
  const c = readShopifyCreds(env);
  const missing = [];
  if (!c.storeUrl) missing.push('SHOPIFY_STORE_URL');
  if (!c.accessToken) missing.push('SHOPIFY_ACCESS_TOKEN');
  if (missing.length) {
    throw new ShopifyCredsError(
      `Shopify Admin API credentials missing: ${missing.join(', ')}. Set them in providers/local/shopify/.env (never commit).`,
    );
  }
  return c;
}

/**
 * Normalize shop hostname from store URL / myshopify host.
 * @param {string} storeUrl
 * @returns {string} host without protocol (e.g. madeira-demo.myshopify.com)
 */
function shopHostFromStoreUrl(storeUrl) {
  let raw = String(storeUrl || '').trim();
  if (!raw) {
    throw new ShopifyCredsError(
      'SHOPIFY_STORE_URL is empty',
      'shopify_bad_store_url',
    );
  }
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new ShopifyCredsError(
      `SHOPIFY_STORE_URL is not a valid URL: ${storeUrl}`,
      'shopify_bad_store_url',
    );
  }
  const host = u.hostname.toLowerCase();
  if (!host) {
    throw new ShopifyCredsError(
      `SHOPIFY_STORE_URL has no host: ${storeUrl}`,
      'shopify_bad_store_url',
    );
  }
  return host;
}

/**
 * @param {string} storeUrl
 * @param {{ apiVersion?: string, limit?: number, pageInfo?: string, fields?: string }} [opts]
 */
function buildProductsUrl(storeUrl, opts) {
  const host = shopHostFromStoreUrl(storeUrl);
  const version = (opts && opts.apiVersion) || DEFAULT_API_VERSION;
  const limit = Math.min(250, Math.max(1, Number((opts && opts.limit) || 50) || 50));
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (opts && opts.pageInfo) params.set('page_info', String(opts.pageInfo));
  if (opts && opts.fields) params.set('fields', String(opts.fields));
  return `https://${host}/admin/api/${version}/products.json?${params.toString()}`;
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
 * Map one Admin API product (+ first variant) into Parts-shaped staging fields.
 * @param {object} product
 * @param {{ source?: string, env?: string, feedKey?: string }} [meta]
 */
function normalizeShopifyProduct(product, meta) {
  const p = product || {};
  const variants = Array.isArray(p.variants) ? p.variants : [];
  const v0 = variants[0] || {};
  const images = Array.isArray(p.images) ? p.images : [];
  const img0 = images[0] || {};
  const id =
    p.id != null
      ? String(p.id)
      : v0.id != null
        ? String(v0.id)
        : p.handle != null
          ? String(p.handle)
          : '';
  const title = p.title != null ? String(p.title) : '';
  let price;
  if (v0.price != null && String(v0.price).trim() !== '') {
    const n = Number(v0.price);
    price = Number.isFinite(n) ? n : undefined;
  }
  const currency =
    v0.presentment_prices &&
    v0.presentment_prices[0] &&
    v0.presentment_prices[0].price &&
    v0.presentment_prices[0].price.currency_code
      ? String(v0.presentment_prices[0].price.currency_code)
      : undefined;
  const stock =
    v0.inventory_quantity != null
      ? String(v0.inventory_quantity)
      : p.status != null
        ? String(p.status)
        : undefined;
  return {
    Source: (meta && meta.source) || 'shopify',
    Env: (meta && meta.env) || undefined,
    FeedKey: (meta && meta.feedKey) || undefined,
    MerchantProductId: id,
    Title: title,
    Description: p.body_html != null ? String(p.body_html) : undefined,
    Url: p.handle ? `/products/${p.handle}` : undefined,
    ImageUrl: img0.src != null ? String(img0.src) : undefined,
    Price: price,
    Currency: currency,
    Stock: stock,
    Raw: { shopifyProductId: p.id, handle: p.handle, vendor: p.vendor },
  };
}

/**
 * @param {object} body Admin products.json payload
 * @param {{ source?: string, env?: string, feedKey?: string }} [meta]
 */
function parseProductsResponse(body, meta) {
  const products =
    body && Array.isArray(body.products)
      ? body.products
      : Array.isArray(body)
        ? body
        : [];
  const rows = [];
  for (const p of products) {
    const row = normalizeShopifyProduct(p, meta);
    if (!row.MerchantProductId || !row.Title) continue;
    rows.push(row);
  }
  return rows;
}

/**
 * Fetch one Admin products page (injectable HTTP).
 * @param {object} [deps]
 * @param {Record<string, string|undefined>} [deps.env]
 * @param {(req: object) => Promise<object>} [deps.httpRequest]
 * @param {number} [deps.limit]
 * @param {string} [deps.pageInfo]
 * @param {string} [deps.envName] Parts Env column
 * @param {string} [deps.feedKey]
 */
async function fetchCatalogPage(deps) {
  const envVars = (deps && deps.env) || process.env;
  const creds = assertShopifyCreds(envVars);
  const url = buildProductsUrl(creds.storeUrl, {
    apiVersion: creds.apiVersion,
    limit: deps && deps.limit,
    pageInfo: deps && deps.pageInfo,
  });
  const http =
    deps && typeof deps.httpRequest === 'function'
      ? deps.httpRequest
      : defaultHttpRequest;
  const res = await http({
    method: 'GET',
    url,
    headers: {
      Accept: 'application/json',
      'X-Shopify-Access-Token': creds.accessToken,
    },
  });
  // Injectable fixtures may return the JSON body directly (amazon-style) or {statusCode,body}.
  let payload = res;
  let status = 200;
  if (res && typeof res === 'object' && 'body' in res && 'statusCode' in res) {
    status = Number(res.statusCode) || 0;
    payload = res.body;
  }
  if (status && (status < 200 || status >= 300)) {
    throw new ShopifyCredsError(
      `Shopify Admin API HTTP ${status}`,
      'shopify_http_error',
    );
  }
  const meta = {
    source: 'shopify',
    env: deps && deps.envName,
    feedKey: deps && deps.feedKey,
  };
  return {
    ok: true,
    source: 'shopify',
    url,
    products: parseProductsResponse(payload, meta),
    raw: payload,
  };
}

module.exports = {
  DEFAULT_API_VERSION,
  ShopifyCredsError,
  readShopifyCreds,
  assertShopifyCreds,
  shopHostFromStoreUrl,
  buildProductsUrl,
  defaultHttpRequest,
  normalizeShopifyProduct,
  parseProductsResponse,
  fetchCatalogPage,
};
