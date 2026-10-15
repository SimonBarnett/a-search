'use strict';

/**
 * Magento products -> Parts staging (FR-243).
 * Default: configurable/parent row with min price; MerchantProductId = SKU.
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

function attr(product, code) {
  const list = product && product.custom_attributes;
  if (!Array.isArray(list)) return null;
  const hit = list.find((a) => a && a.attribute_code === code);
  return hit ? hit.value : null;
}

function absoluteProductUrl(storeBaseUrl, product) {
  const base = String(storeBaseUrl || '').replace(/\/$/, '');
  const urlKey = attr(product, 'url_key') || product.url_key || product.sku;
  if (!base || !urlKey) return base ? `${base}/` : '';
  return `${base}/${String(urlKey).replace(/^\//, '')}.html`;
}

function imageUrl(storeBaseUrl, product) {
  const entries = product && product.media_gallery_entries;
  if (!Array.isArray(entries) || !entries.length) return null;
  const file = entries[0].file || entries[0].url;
  if (!file) return null;
  if (/^https?:\/\//i.test(String(file))) return String(file);
  const base = String(storeBaseUrl || '').replace(/\/$/, '');
  return `${base}/media/catalog/product${String(file).startsWith('/') ? '' : '/'}${file}`;
}

/**
 * Min price for configurable: use product.price or lowest extension price.
 * @param {object} product
 */
function minPrice(product) {
  if (product.price != null && product.price !== '') return Number(product.price);
  const opts =
    product.extension_attributes &&
    product.extension_attributes.configurable_product_options;
  if (Array.isArray(product.children) && product.children.length) {
    let min = Infinity;
    for (const c of product.children) {
      if (c.price != null) min = Math.min(min, Number(c.price));
    }
    if (min !== Infinity) return min;
  }
  return opts ? null : null;
}

/**
 * @param {object} product
 * @param {{ source?: string, env: string, feedKey: string, storeBaseUrl?: string, currency?: string }} meta
 */
function normalizeMagentoProduct(product, meta) {
  if (!meta || typeof meta !== 'object') {
    throw new Error('normalizeMagentoProduct: meta required');
  }
  const feedKey = String(meta.feedKey || '').trim();
  const env = String(meta.env || '').trim();
  if (!feedKey) throw new Error('normalizeMagentoProduct: meta.feedKey required');
  if (env !== 'live' && env !== 'sandbox') {
    throw new Error(
      `normalizeMagentoProduct: meta.env must be live|sandbox, got ${JSON.stringify(env)}`,
    );
  }
  const p = product || {};
  const sku = p.sku != null ? String(p.sku).trim() : '';
  const title = p.name != null ? String(p.name).trim() : '';
  if (!sku || !title) return null;
  // visibility: 1 Not Visible, 2 Catalog, 3 Search, 4 Catalog/Search — skip Not Visible
  if (p.visibility != null && Number(p.visibility) === 1) return null;

  const row = {
    Source: String(meta.source || 'magento'),
    FeedKey: feedKey,
    MerchantProductId: sku,
    Env: env,
    Title: title,
    Description: attr(p, 'description') || p.description || null,
    Url: absoluteProductUrl(meta.storeBaseUrl, p),
    ImageUrl: imageUrl(meta.storeBaseUrl, p),
    Price: minPrice(p),
    Currency: meta.currency || 'GBP',
    Stock:
      p.extension_attributes &&
      p.extension_attributes.stock_item &&
      p.extension_attributes.stock_item.qty != null
        ? Number(p.extension_attributes.stock_item.qty)
        : null,
  };
  row.ContentHash = contentHashForPartsRow(row);
  return assertPartsRow(row);
}

function normalizeMagentoCatalog(body, meta) {
  let items = [];
  if (Array.isArray(body)) items = body;
  else if (body && Array.isArray(body.items)) items = body.items;
  else if (body && Array.isArray(body.products)) items = body.products;
  else if (body && typeof body === 'object') items = [body];
  const out = [];
  for (const p of items) {
    const row = normalizeMagentoProduct(p, meta);
    if (row) out.push(row);
  }
  return out;
}

function loadFixtureProducts(fixturePath) {
  const raw = fs.readFileSync(fixturePath || DEFAULT_FIXTURE, 'utf8');
  const json = JSON.parse(raw);
  return Array.isArray(json.items) ? json.items : json.products || json;
}

module.exports = {
  REQUIRED_PARTS_FIELDS,
  contentHashForPartsRow,
  assertPartsRow,
  absoluteProductUrl,
  normalizeMagentoProduct,
  normalizeMagentoCatalog,
  loadFixtureProducts,
  DEFAULT_FIXTURE,
};
