'use strict';

/**
 * Normalize Wix Stores products → Parts staging columns (FR-106).
 * Stay-dark: registry enabled stays false. Catalogue fetch is FR-105; worker is FR-107.
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
 * Map one Wix Stores product into Parts staging fields.
 * @param {object} product
 * @param {{ source?: string, env: string, feedKey: string, contentHash?: string|null }} meta
 * @returns {Record<string, unknown>|null}
 */
function normalizeWixProduct(product, meta) {
  if (!meta || typeof meta !== 'object') {
    throw new Error('normalizeWixProduct: meta required');
  }
  const feedKey = String(meta.feedKey || '').trim();
  const env = String(meta.env || '').trim();
  if (!feedKey) throw new Error('normalizeWixProduct: meta.feedKey required');
  if (env !== 'live' && env !== 'sandbox') {
    throw new Error(
      `normalizeWixProduct: meta.env must be live|sandbox, got ${JSON.stringify(env)}`,
    );
  }

  const p = product || {};
  const id =
    p.id != null
      ? String(p.id)
      : p.Id != null
        ? String(p.Id)
        : p.productId != null
          ? String(p.productId)
          : p.slug != null
            ? String(p.slug)
            : '';
  const title =
    p.name != null
      ? String(p.name).trim()
      : p.Name != null
        ? String(p.Name).trim()
        : p.title != null
          ? String(p.title).trim()
          : '';
  if (!id || !title) return null;

  let price = null;
  const priceData = p.priceData || (typeof p.price === 'object' ? p.price : {}) || {};
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
    price = Number.isFinite(n) ? n : null;
  }
  const currency =
    priceData.currency != null
      ? String(priceData.currency)
      : p.currency != null
        ? String(p.currency)
        : null;

  const media = p.media || {};
  const mainMedia =
    media.mainMedia || (Array.isArray(media.items) && media.items[0]) || {};
  const imageUrl =
    (mainMedia.image && mainMedia.image.url) ||
    mainMedia.url ||
    (p.mediaUrl != null ? String(p.mediaUrl) : null);

  const stock =
    p.stock && p.stock.quantity != null
      ? String(p.stock.quantity)
      : p.inventory && p.inventory.quantity != null
        ? String(p.inventory.quantity)
        : p.visible === false
          ? 'hidden'
          : null;

  const productPageUrl =
    p.productPageUrl && p.productPageUrl.base
      ? `${p.productPageUrl.base}${p.productPageUrl.path || ''}`
      : p.url != null
        ? String(p.url)
        : null;

  /** @type {Record<string, unknown>} */
  const row = {
    Source: String(meta.source || 'wix').trim() || 'wix',
    FeedKey: feedKey,
    MerchantProductId: id,
    Env: env,
    Title: title,
    Description:
      p.description != null
        ? String(p.description)
        : p.Description != null
          ? String(p.Description)
          : null,
    Url: productPageUrl,
    ImageUrl: imageUrl != null ? String(imageUrl) : null,
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
 * @param {object|Array} body
 * @param {{ source?: string, env: string, feedKey: string, contentHash?: string|null }} meta
 * @returns {Array<Record<string, unknown>>}
 */
function normalizeWixCatalog(body, meta) {
  const products =
    body && Array.isArray(body.products)
      ? body.products
      : Array.isArray(body)
        ? body
        : [];
  const rows = [];
  for (const p of products) {
    const row = normalizeWixProduct(p, meta);
    if (row) rows.push(row);
  }
  return rows;
}

/**
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

function readDefaultFixture() {
  return JSON.parse(fs.readFileSync(DEFAULT_FIXTURE, 'utf8'));
}

module.exports = {
  DEFAULT_FIXTURE,
  REQUIRED_PARTS_FIELDS,
  contentHashForPartsRow,
  normalizeWixProduct,
  normalizeWixCatalog,
  assertPartsRow,
  readDefaultFixture,
};
