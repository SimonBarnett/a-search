'use strict';

/**
 * Normalize Shopify Admin REST products → Parts staging columns (FR-102).
 * Stay-dark: registry enabled stays false. Catalogue fetch is FR-101; worker is FR-103.
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
 * Map one Admin API product (+ first variant) into Parts staging fields.
 * @param {object} product
 * @param {{ source?: string, env: string, feedKey: string, contentHash?: string|null }} meta
 * @returns {Record<string, unknown>|null}
 */
function normalizeShopifyProduct(product, meta) {
  if (!meta || typeof meta !== 'object') {
    throw new Error('normalizeShopifyProduct: meta required');
  }
  const feedKey = String(meta.feedKey || '').trim();
  const env = String(meta.env || '').trim();
  if (!feedKey) throw new Error('normalizeShopifyProduct: meta.feedKey required');
  if (env !== 'live' && env !== 'sandbox') {
    throw new Error(
      `normalizeShopifyProduct: meta.env must be live|sandbox, got ${JSON.stringify(env)}`,
    );
  }

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
  const title = p.title != null ? String(p.title).trim() : '';
  if (!id || !title) return null;

  let price = null;
  if (v0.price != null && String(v0.price).trim() !== '') {
    const n = Number(v0.price);
    price = Number.isFinite(n) ? n : null;
  }
  const currency =
    v0.presentment_prices &&
    v0.presentment_prices[0] &&
    v0.presentment_prices[0].price &&
    v0.presentment_prices[0].price.currency_code
      ? String(v0.presentment_prices[0].price.currency_code)
      : null;
  const stock =
    v0.inventory_quantity != null
      ? String(v0.inventory_quantity)
      : p.status != null
        ? String(p.status)
        : null;

  /** @type {Record<string, unknown>} */
  const row = {
    Source: String(meta.source || 'shopify').trim() || 'shopify',
    FeedKey: feedKey,
    MerchantProductId: id,
    Env: env,
    Title: title,
    Description: p.body_html != null ? String(p.body_html) : null,
    Url: p.handle ? `/products/${p.handle}` : null,
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
 * Normalize Admin products.json body (or array) → Parts rows.
 * @param {object|Array} body
 * @param {{ source?: string, env: string, feedKey: string, contentHash?: string|null }} meta
 * @returns {Array<Record<string, unknown>>}
 */
function normalizeShopifyCatalog(body, meta) {
  const products =
    body && Array.isArray(body.products)
      ? body.products
      : Array.isArray(body)
        ? body
        : [];
  const rows = [];
  for (const p of products) {
    const row = normalizeShopifyProduct(p, meta);
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
 * Load recorded Admin products fixture.
 * @returns {object}
 */
function readDefaultFixture() {
  return JSON.parse(fs.readFileSync(DEFAULT_FIXTURE, 'utf8'));
}

module.exports = {
  DEFAULT_FIXTURE,
  REQUIRED_PARTS_FIELDS,
  contentHashForPartsRow,
  normalizeShopifyProduct,
  normalizeShopifyCatalog,
  assertPartsRow,
  readDefaultFixture,
};
