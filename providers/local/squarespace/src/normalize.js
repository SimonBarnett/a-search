'use strict';

/**
 * Normalize Squarespace Commerce products -> Parts staging (FR-242).
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_FIXTURE = path.join(
  __dirname,
  '..',
  'fixtures',
  'products-ok.json',
);

const REQUIRED_PARTS_FIELDS = [
  'Source',
  'FeedKey',
  'MerchantProductId',
  'Env',
  'Title',
];

function contentHashForPartsRow(row) {
  const payload = [
    row.Title,
    row.Description,
    row.Url,
    row.ImageUrl,
    row.Price,
    row.Currency,
    row.Stock,
  ]
    .map((v) => (v == null ? '' : String(v)))
    .join('\0');
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

function assertPartsRow(row) {
  for (const f of REQUIRED_PARTS_FIELDS) {
    if (row[f] == null || row[f] === '') {
      throw new Error(`assertPartsRow: missing ${f}`);
    }
  }
  return row;
}

/**
 * Absolute product URL from site domain + slug/path.
 * @param {string} siteDomain
 * @param {object} product
 */
function absoluteProductUrl(siteDomain, product) {
  if (product.url && /^https?:\/\//i.test(String(product.url))) {
    return String(product.url);
  }
  if (product.productPageUrl && /^https?:\/\//i.test(String(product.productPageUrl))) {
    return String(product.productPageUrl);
  }
  const domain = String(siteDomain || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  const slug =
    product.urlSlug ||
    product.slug ||
    (product.url && String(product.url).replace(/^\//, '')) ||
    '';
  if (!domain || !slug) return domain ? `https://${domain}/` : '';
  return `https://${domain}/${String(slug).replace(/^\//, '')}`;
}

/**
 * @param {object} product
 * @param {{ source?: string, env: string, feedKey: string, siteDomain?: string }} meta
 * @returns {Record<string, unknown>[]}
 */
function normalizeSquarespaceProduct(product, meta) {
  if (!meta || typeof meta !== 'object') {
    throw new Error('normalizeSquarespaceProduct: meta required');
  }
  const feedKey = String(meta.feedKey || '').trim();
  const env = String(meta.env || '').trim();
  if (!feedKey) throw new Error('normalizeSquarespaceProduct: meta.feedKey required');
  if (env !== 'live' && env !== 'sandbox') {
    throw new Error(
      `normalizeSquarespaceProduct: meta.env must be live|sandbox, got ${JSON.stringify(env)}`,
    );
  }
  const source = String(meta.source || 'squarespace');
  const p = product || {};
  const variants = Array.isArray(p.variants) ? p.variants : [];
  const siteDomain = meta.siteDomain || p.siteDomain || '';
  const baseTitle = String(p.name || p.title || '').trim();
  const currency =
    (p.pricing && p.pricing.currency) ||
    p.currency ||
    (variants[0] && variants[0].pricing && variants[0].pricing.currency) ||
    'GBP';
  const imageUrl =
    (p.images && p.images[0] && (p.images[0].url || p.images[0].imageUrl)) ||
    p.imageUrl ||
    null;
  const url = absoluteProductUrl(siteDomain, p);

  const rows = [];
  const pushRow = (merchantProductId, title, price, stock) => {
    const row = {
      Source: source,
      FeedKey: feedKey,
      MerchantProductId: String(merchantProductId),
      Env: env,
      Title: title,
      Description: p.description ? String(p.description) : null,
      Url: url,
      ImageUrl: imageUrl ? String(imageUrl) : null,
      Price: price != null ? Number(price) : null,
      Currency: currency ? String(currency) : null,
      Stock: stock != null ? Number(stock) : null,
    };
    row.ContentHash = contentHashForPartsRow(row);
    rows.push(assertPartsRow(row));
  };

  if (variants.length === 0) {
    const id = p.id != null ? p.id : p.productId;
    if (id == null || !baseTitle) return [];
    const price =
      (p.pricing && (p.pricing.basePrice || p.pricing.price)) || p.price || null;
    const stock =
      p.stock != null
        ? p.stock
        : p.inventory && p.inventory.quantity != null
          ? p.inventory.quantity
          : null;
    pushRow(id, baseTitle, price, stock);
    return rows;
  }

  for (const v of variants) {
    const vid = v.id != null ? v.id : v.sku || v.skuId;
    if (vid == null) continue;
    const vTitle = v.sku
      ? `${baseTitle} / ${v.sku}`
      : v.name
        ? `${baseTitle} / ${v.name}`
        : baseTitle;
    const price =
      (v.pricing && (v.pricing.basePrice || v.pricing.price)) || v.price || null;
    const stock =
      v.stock != null
        ? v.stock
        : v.inventory && v.inventory.quantity != null
          ? v.inventory.quantity
          : null;
    pushRow(vid, vTitle, price, stock);
  }
  return rows;
}

/**
 * @param {object|object[]} body
 * @param {object} meta
 */
function normalizeSquarespaceCatalog(body, meta) {
  let products = [];
  if (Array.isArray(body)) products = body;
  else if (body && Array.isArray(body.products)) products = body.products;
  else if (body && typeof body === 'object') products = [body];
  const out = [];
  for (const p of products) {
    out.push(...normalizeSquarespaceProduct(p, meta));
  }
  return out;
}

function loadFixtureProducts(fixturePath) {
  const raw = fs.readFileSync(fixturePath || DEFAULT_FIXTURE, 'utf8');
  const json = JSON.parse(raw);
  return Array.isArray(json.products) ? json.products : json;
}

module.exports = {
  REQUIRED_PARTS_FIELDS,
  contentHashForPartsRow,
  assertPartsRow,
  absoluteProductUrl,
  normalizeSquarespaceProduct,
  normalizeSquarespaceCatalog,
  loadFixtureProducts,
  DEFAULT_FIXTURE,
};
