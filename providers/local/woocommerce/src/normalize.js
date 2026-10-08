'use strict';

/**
 * Normalize WooCommerce REST products -> Parts staging columns (FR-110).
 * Stay-dark: registry enabled stays false. Catalogue fetch is FR-109; worker is FR-111.
 *
 * Parts natural key: Source + FeedKey + MerchantProductId + Env.
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

/**
 * Stable content hash for MERGE churn detection.
 * @param {Record<string, unknown>} row
 * @returns {string}
 */
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

/**
 * Map one WooCommerce REST product into Parts staging fields.
 * @param {object} product
 * @param {{ source?: string, env: string, feedKey: string, contentHash?: string|null }} meta
 * @returns {Record<string, unknown>|null}
 */
function normalizeWooCommerceProduct(product, meta) {
  if (!meta || typeof meta !== 'object') {
    throw new Error('normalizeWooCommerceProduct: meta required');
  }
  const feedKey = String(meta.feedKey || '').trim();
  const env = String(meta.env || '').trim();
  if (!feedKey) {
    throw new Error('normalizeWooCommerceProduct: meta.feedKey required');
  }
  if (env !== 'live' && env !== 'sandbox') {
    throw new Error(
      `normalizeWooCommerceProduct: meta.env must be live|sandbox, got ${JSON.stringify(env)}`,
    );
  }

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
      ? String(p.name).trim()
      : p.title != null
        ? String(p.title).trim()
        : '';
  if (!id || !title) return null;

  let price = null;
  const priceRaw =
    p.price != null && String(p.price).trim() !== ''
      ? p.price
      : p.regular_price;
  if (priceRaw != null && String(priceRaw).trim() !== '') {
    const n = Number(priceRaw);
    price = Number.isFinite(n) ? n : null;
  }
  const currency =
    p.currency != null && String(p.currency).trim()
      ? String(p.currency).trim()
      : null;
  let stock = null;
  if (p.stock_quantity != null) {
    stock = String(p.stock_quantity);
  } else if (p.stock_status != null) {
    stock = String(p.stock_status);
  }

  const permalink =
    p.permalink != null && String(p.permalink).trim()
      ? String(p.permalink).trim()
      : null;
  const relative = !permalink && p.slug ? `/product/${p.slug}` : null;

  /** @type {Record<string, unknown>} */
  const row = {
    Source: String(meta.source || 'woocommerce').trim() || 'woocommerce',
    FeedKey: feedKey,
    MerchantProductId: id,
    Env: env,
    Title: title,
    Description:
      p.description != null
        ? String(p.description)
        : p.short_description != null
          ? String(p.short_description)
          : null,
    Url: permalink || relative,
    ImageUrl: img0.src != null ? String(img0.src) : null,
    Price: price,
    Currency: currency,
    Stock: stock,
  };
  row.ContentHash =
    meta.contentHash != null && String(meta.contentHash).trim() !== ''
      ? String(meta.contentHash)
      : contentHashForPartsRow(row);
  return row;
}

/**
 * Normalize WooCommerce products payload (array or {products}) -> Parts rows.
 * @param {object|Array} body
 * @param {{ source?: string, env: string, feedKey: string, contentHash?: string|null }} meta
 * @returns {Array<Record<string, unknown>>}
 */
function normalizeWooCommerceCatalog(body, meta) {
  const products = Array.isArray(body)
    ? body
    : body && Array.isArray(body.products)
      ? body.products
      : [];
  const rows = [];
  for (const p of products) {
    const row = normalizeWooCommerceProduct(p, meta);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * Assert required Parts columns present (unit / onboarding gate).
 * @param {Record<string, unknown>} row
 */
function assertPartsRow(row) {
  if (!row || typeof row !== 'object') {
    throw new Error('assertPartsRow: row required');
  }
  for (const key of REQUIRED_PARTS_FIELDS) {
    if (row[key] == null || String(row[key]).trim() === '') {
      throw new Error(`assertPartsRow: missing required Parts field ${key}`);
    }
  }
  if (row.Env !== 'live' && row.Env !== 'sandbox') {
    throw new Error(`assertPartsRow: Env must be live|sandbox, got ${row.Env}`);
  }
  return row;
}

/**
 * Load recorded WooCommerce products fixture.
 * @returns {object}
 */
function readDefaultFixture() {
  return JSON.parse(fs.readFileSync(DEFAULT_FIXTURE, 'utf8'));
}

module.exports = {
  DEFAULT_FIXTURE,
  REQUIRED_PARTS_FIELDS,
  contentHashForPartsRow,
  normalizeWooCommerceProduct,
  normalizeWooCommerceCatalog,
  assertPartsRow,
  readDefaultFixture,
};
