'use strict';

/**
 * Wix Stores catalogue client (FR-105).
 * Lists site products via POST /stores/v1/products/query (Authorization + wix-site-id).
 * HTTP is injectable for recorded fixtures; stay-dark (registry enabled false).
 */

const DEFAULT_API_BASE = 'https://www.wixapis.com';
const DEFAULT_QUERY_PATH = '/stores/v1/products/query';

class WixCredsError extends Error {
  /**
   * @param {string} [message]
   * @param {string} [code]
   */
  constructor(message, code) {
    super(message || 'wix_missing_credentials');
    this.name = 'WixCredsError';
    this.code = code || 'wix_missing_credentials';
  }
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function readWixCreds(env) {
  const e = env || process.env;
  const siteId = e.WIX_SITE_ID != null ? String(e.WIX_SITE_ID).trim() : '';
  const apiToken = e.WIX_API_TOKEN != null ? String(e.WIX_API_TOKEN).trim() : '';
  const apiBase =
    e.WIX_API_BASE != null && String(e.WIX_API_BASE).trim()
      ? String(e.WIX_API_BASE).trim().replace(/\/$/, '')
      : DEFAULT_API_BASE;
  return { siteId, apiToken, apiBase };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function assertWixCreds(env) {
  const c = readWixCreds(env);
  const missing = [];
  if (!c.siteId) missing.push('WIX_SITE_ID');
  if (!c.apiToken) missing.push('WIX_API_TOKEN');
  if (missing.length) {
    throw new WixCredsError(
      `Wix Stores API credentials missing: ${missing.join(', ')}. Set them in providers/local/wix/.env (never commit).`,
    );
  }
  return c;
}

/**
 * @param {string} apiBase
 * @returns {string}
 */
function buildProductsQueryUrl(apiBase) {
  const base = String(apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
  return `${base}${DEFAULT_QUERY_PATH}`;
}

/**
 * Default Node https JSON helper.
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
 * Map one Wix Stores product into Parts-shaped staging fields.
 * @param {object} product
 * @param {{ source?: string, env?: string, feedKey?: string }} [meta]
 */
function normalizeWixProduct(product, meta) {
  const p = product || {};
  const id =
    p.id != null
      ? String(p.id)
      : p.Id != null
        ? String(p.Id)
        : p.productId != null
          ? String(p.productId)
          : '';
  const title =
    p.name != null
      ? String(p.name)
      : p.Name != null
        ? String(p.Name)
        : p.title != null
          ? String(p.title)
          : '';

  let price;
  const priceData = p.priceData || p.price || {};
  const priceRaw =
    priceData.price != null
      ? priceData.price
      : priceData.amount != null
        ? priceData.amount
        : p.price != null && typeof p.price !== 'object'
          ? p.price
          : undefined;
  if (priceRaw != null && String(priceRaw).trim() !== '') {
    const n = Number(priceRaw);
    price = Number.isFinite(n) ? n : undefined;
  }
  const currency =
    priceData.currency != null
      ? String(priceData.currency)
      : p.currency != null
        ? String(p.currency)
        : undefined;

  const media = p.media || {};
  const mainMedia = media.mainMedia || (Array.isArray(media.items) && media.items[0]) || {};
  const imageUrl =
    (mainMedia.image && mainMedia.image.url) ||
    mainMedia.url ||
    (p.mediaUrl != null ? String(p.mediaUrl) : undefined);

  const stock =
    p.stock && p.stock.quantity != null
      ? String(p.stock.quantity)
      : p.inventory && p.inventory.quantity != null
        ? String(p.inventory.quantity)
        : p.visible === false
          ? 'hidden'
          : undefined;

  const productPageUrl =
    p.productPageUrl && p.productPageUrl.base
      ? `${p.productPageUrl.base}${p.productPageUrl.path || ''}`
      : p.url != null
        ? String(p.url)
        : undefined;

  return {
    Source: (meta && meta.source) || 'wix',
    Env: (meta && meta.env) || undefined,
    FeedKey: (meta && meta.feedKey) || undefined,
    MerchantProductId: id,
    Title: title,
    Description:
      p.description != null
        ? String(p.description)
        : p.Description != null
          ? String(p.Description)
          : undefined,
    Url: productPageUrl,
    ImageUrl: imageUrl != null ? String(imageUrl) : undefined,
    Price: price,
    Currency: currency,
    Stock: stock,
    Raw: { wixProductId: p.id || p.Id, slug: p.slug || p.handle },
  };
}

/**
 * @param {object} body Query products response
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
    const row = normalizeWixProduct(p, meta);
    if (!row.MerchantProductId || !row.Title) continue;
    rows.push(row);
  }
  return rows;
}

/**
 * Fetch one Wix products query page (injectable HTTP).
 * @param {object} [deps]
 * @param {Record<string, string|undefined>} [deps.env]
 * @param {(req: object) => Promise<object>} [deps.httpRequest]
 * @param {number} [deps.limit]
 * @param {string} [deps.envName]
 * @param {string} [deps.feedKey]
 */
async function fetchCatalogPage(deps) {
  const envVars = (deps && deps.env) || process.env;
  const creds = assertWixCreds(envVars);
  const url = buildProductsQueryUrl(creds.apiBase);
  const limit = Math.min(100, Math.max(1, Number((deps && deps.limit) || 50) || 50));
  const bodyObj = {
    query: {
      paging: { limit },
    },
  };
  const http =
    deps && typeof deps.httpRequest === 'function'
      ? deps.httpRequest
      : defaultHttpRequest;
  const res = await http({
    method: 'POST',
    url,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: creds.apiToken,
      'wix-site-id': creds.siteId,
    },
    body: JSON.stringify(bodyObj),
  });
  let payload = res;
  let status = 200;
  if (res && typeof res === 'object' && 'body' in res && 'statusCode' in res) {
    status = Number(res.statusCode) || 0;
    payload = res.body;
  }
  if (status && (status < 200 || status >= 300)) {
    throw new WixCredsError(`Wix Stores API HTTP ${status}`, 'wix_http_error');
  }
  const meta = {
    source: 'wix',
    env: deps && deps.envName,
    feedKey: deps && deps.feedKey,
  };
  return {
    ok: true,
    source: 'wix',
    url,
    products: parseProductsResponse(payload, meta),
    raw: payload,
  };
}

module.exports = {
  DEFAULT_API_BASE,
  DEFAULT_QUERY_PATH,
  WixCredsError,
  readWixCreds,
  assertWixCreds,
  buildProductsQueryUrl,
  defaultHttpRequest,
  normalizeWixProduct,
  parseProductsResponse,
  fetchCatalogPage,
};
