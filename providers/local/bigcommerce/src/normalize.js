'use strict';

/**
 * BigCommerce catalog products -> Parts staging (FR-245).
 * One row per product (parent); MerchantProductId = product id.
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
 * @param {string} shopDomain
 * @param {object} product
 */
function absoluteProductUrl(shopDomain, product) {
  if (product.url && /^https?:\/\//i.test(String(product.url))) {
    return String(product.url);
  }
  const domain = String(shopDomain || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  const pathPart =
    (product.custom_url && product.custom_url.url) ||
    product.custom_url ||
    '';
  if (!domain) return '';
  if (!pathPart) return `https://${domain}/`;
  const p = String(pathPart).startsWith('/')
    ? String(pathPart)
    : `/${pathPart}`;
  return `https://${domain}${p}`;
}

function imageUrl(product) {
  if (product.primary_image && product.primary_image.url_standard) {
    return String(product.primary_image.url_standard);
  }
  if (product.primary_image && product.primary_image.url_zoom) {
    return String(product.primary_image.url_zoom);
  }
  const images = Array.isArray(product.images) ? product.images : [];
  if (images[0]) {
    return String(
      images[0].url_standard || images[0].url_zoom || images[0].url || '',
    ) || null;
  }
  return null;
}

/**
 * @param {object} product
 * @param {{ source?: string, env: string, feedKey: string, shopDomain?: string, currency?: string }} meta
 */
function normalizeBigCommerceProduct(product, meta) {
  if (!meta || typeof meta !== 'object') {
    throw new Error('normalizeBigCommerceProduct: meta required');
  }
  const feedKey = String(meta.feedKey || '').trim();
  const env = String(meta.env || '').trim();
  if (!feedKey) throw new Error('normalizeBigCommerceProduct: meta.feedKey required');
  if (env !== 'live' && env !== 'sandbox') {
    throw new Error(
      `normalizeBigCommerceProduct: meta.env must be live|sandbox, got ${JSON.stringify(env)}`,
    );
  }
  const p = product || {};
  if (p.is_visible === false) return null;
  const id = p.id != null ? String(p.id).trim() : '';
  const title = p.name != null ? String(p.name).trim() : '';
  if (!id || !title) return null;

  let price = null;
  if (p.calculated_price != null && String(p.calculated_price).trim() !== '') {
    const n = Number(p.calculated_price);
    price = Number.isFinite(n) ? n : null;
  } else if (p.price != null && String(p.price).trim() !== '') {
    const n = Number(p.price);
    price = Number.isFinite(n) ? n : null;
  }

  const row = {
    Source: String(meta.source || 'bigcommerce'),
    FeedKey: feedKey,
    MerchantProductId: id,
    Env: env,
    Title: title,
    Description: p.description != null ? String(p.description) : null,
    Url: absoluteProductUrl(meta.shopDomain, p),
    ImageUrl: imageUrl(p),
    Price: price,
    Currency: meta.currency || 'GBP',
    Stock: p.inventory_level != null ? Number(p.inventory_level) : null,
  };
  row.ContentHash = contentHashForPartsRow(row);
  return assertPartsRow(row);
}

function normalizeBigCommerceCatalog(body, meta) {
  let items = [];
  if (Array.isArray(body)) items = body;
  else if (body && Array.isArray(body.data)) items = body.data;
  else if (body && Array.isArray(body.products)) items = body.products;
  else if (body && typeof body === 'object') items = [body];
  const out = [];
  for (const p of items) {
    const row = normalizeBigCommerceProduct(p, meta);
    if (row) out.push(row);
  }
  return out;
}

function loadFixtureProducts(fixturePath) {
  const raw = fs.readFileSync(fixturePath || DEFAULT_FIXTURE, 'utf8');
  const json = JSON.parse(raw);
  return Array.isArray(json.data) ? json.data : json.products || json;
}

module.exports = {
  REQUIRED_PARTS_FIELDS,
  contentHashForPartsRow,
  assertPartsRow,
  absoluteProductUrl,
  normalizeBigCommerceProduct,
  normalizeBigCommerceCatalog,
  loadFixtureProducts,
  DEFAULT_FIXTURE,
};
