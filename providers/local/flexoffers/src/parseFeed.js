'use strict';

/**
 * FR-097: Flexoffers maintainer feed-parser hook (fixture-level).
 * Compatible with maintainer schedule deps.parseFeedRows(body, meta).
 * Stay-dark: registry enabled stays false; no live network.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_FIXTURE = path.join(
  __dirname,
  '..',
  'fixtures',
  'products-ok.csv',
);

class FlexoffersFeedCredsError extends Error {
  /**
   * @param {string} code
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message || code);
    this.name = 'FlexoffersFeedCredsError';
    this.code = code;
  }
}

/**
 * Feed URL / API placeholders used by maintainer fetch when Source=flexoffers.
 * PartFeedKeys.FeedUrl is the durable locator; env fills auth headers only.
 * @param {Record<string, string|undefined>} [env]
 */
function assertFlexoffersFeedCreds(env = process.env) {
  const key = (env.FLEXOFFERS_API_KEY || env.FLEXOFFERS_FEED_TOKEN || '').trim();
  if (!key) {
    throw new FlexoffersFeedCredsError(
      'flexoffers_missing_feed_credentials',
      'FLEXOFFERS_API_KEY (or FLEXOFFERS_FEED_TOKEN) required for feed fetch',
    );
  }
  return {
    apiKey: key,
    publisherId: (env.FLEXOFFERS_PUBLISHER_ID || '').trim() || null,
    defaultFeedUrl: (env.FLEXOFFERS_FEED_URL || '').trim() || null,
  };
}

/**
 * Minimal CSV split (no quoted-newline support — fixture / simple Flexoffers exports).
 * @param {string} line
 * @returns {string[]}
 */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * @param {string} header
 * @returns {string}
 */
function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/** @type {Record<string, string>} */
const HEADER_ALIASES = {
  merchant_product_id: 'MerchantProductId',
  product_id: 'MerchantProductId',
  id: 'MerchantProductId',
  sku: 'MerchantProductId',
  title: 'Title',
  name: 'Title',
  description: 'Description',
  url: 'Url',
  link: 'Url',
  product_url: 'Url',
  image_url: 'ImageUrl',
  image: 'ImageUrl',
  image_link: 'ImageUrl',
  price: 'Price',
  currency: 'Currency',
  stock: 'Stock',
  availability: 'Stock',
};

/**
 * Parse Flexoffers CSV (or JSON array / NDJSON) into Parts staging-shaped rows.
 * @param {Buffer|string} body
 * @param {{ source?: string, feedKey: string, env: string, contentHash?: string|null }} meta
 * @returns {Array<Record<string, unknown>>}
 */
function parseFlexoffersFeedRows(body, meta) {
  if (!meta || typeof meta !== 'object') {
    throw new Error('parseFlexoffersFeedRows: meta required');
  }
  const feedKey = String(meta.feedKey || '').trim();
  const env = String(meta.env || '').trim();
  if (!feedKey) throw new Error('parseFlexoffersFeedRows: meta.feedKey required');
  if (env !== 'live' && env !== 'sandbox') {
    throw new Error(
      `parseFlexoffersFeedRows: meta.env must be live|sandbox, got ${JSON.stringify(env)}`,
    );
  }

  const source = String(meta.source || 'flexoffers').trim() || 'flexoffers';
  const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body || '');
  const trimmed = text.trim();
  if (!trimmed) return [];

  /** @type {Array<Record<string, unknown>>} */
  let rawRows;

  if (trimmed.startsWith('[')) {
    const items = JSON.parse(trimmed);
    if (!Array.isArray(items)) {
      throw new Error('parseFlexoffersFeedRows: expected JSON array');
    }
    rawRows = items.map((row) => normalizeObjectRow(row));
  } else if (trimmed.includes(',') && !trimmed.startsWith('{')) {
    rawRows = parseCsvRows(trimmed);
  } else {
    // NDJSON
    rawRows = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => normalizeObjectRow(JSON.parse(line)));
  }

  const out = [];
  for (const row of rawRows) {
    const id = row.MerchantProductId != null ? String(row.MerchantProductId).trim() : '';
    if (!id) continue;
    const title = row.Title != null ? String(row.Title).trim() : '';
    if (!title) continue;

    let price = null;
    if (row.Price != null && String(row.Price).trim() !== '') {
      const n = Number(row.Price);
      price = Number.isFinite(n) ? n : null;
    }

    out.push({
      Source: source,
      FeedKey: feedKey,
      MerchantProductId: id,
      Env: env,
      Title: title,
      Description:
        row.Description != null ? String(row.Description) : null,
      Url: row.Url != null ? String(row.Url) : null,
      ImageUrl: row.ImageUrl != null ? String(row.ImageUrl) : null,
      Price: price,
      Currency: row.Currency != null ? String(row.Currency) : null,
      Stock: row.Stock != null ? String(row.Stock) : null,
      ContentHash: row.ContentHash || meta.contentHash || null,
    });
  }
  return out;
}

/**
 * @param {string} csvText
 * @returns {Array<Record<string, unknown>>}
 */
function parseCsvRows(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  const fieldKeys = headers.map((h) => HEADER_ALIASES[h] || null);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]);
    /** @type {Record<string, unknown>} */
    const row = {};
    for (let c = 0; c < fieldKeys.length; c += 1) {
      const key = fieldKeys[c];
      if (!key) continue;
      row[key] = cols[c] != null ? cols[c] : '';
    }
    rows.push(row);
  }
  return rows;
}

/**
 * @param {unknown} row
 * @returns {Record<string, unknown>}
 */
function normalizeObjectRow(row) {
  if (!row || typeof row !== 'object') return {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const alias = HEADER_ALIASES[normalizeHeader(k)];
    if (alias) out[alias] = v;
    else if (
      [
        'MerchantProductId',
        'Title',
        'Description',
        'Url',
        'ImageUrl',
        'Price',
        'Currency',
        'Stock',
        'ContentHash',
      ].includes(k)
    ) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Maintainer-facing adapter: only handles Source=flexoffers; others throw.
 * Deploy may wire `deps.parseFeedRows = flexoffersParseFeedRowsHook`.
 * @param {Buffer|string} body
 * @param {{ source: string, feedKey: string, env: string, contentHash?: string|null }} meta
 */
function flexoffersParseFeedRowsHook(body, meta) {
  const source = meta && meta.source != null ? String(meta.source) : '';
  if (source && source !== 'flexoffers') {
    throw new Error(
      `flexoffersParseFeedRowsHook: wrong source ${JSON.stringify(source)}`,
    );
  }
  return parseFlexoffersFeedRows(body, {
    ...meta,
    source: 'flexoffers',
  });
}

/**
 * Load the recorded CSV fixture (tests / offline self-check).
 * @returns {string}
 */
function readDefaultFixtureCsv() {
  return fs.readFileSync(DEFAULT_FIXTURE, 'utf8');
}

module.exports = {
  parseFlexoffersFeedRows,
  flexoffersParseFeedRowsHook,
  assertFlexoffersFeedCreds,
  FlexoffersFeedCredsError,
  readDefaultFixtureCsv,
  DEFAULT_FIXTURE,
  HEADER_ALIASES,
};
