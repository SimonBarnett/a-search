'use strict';

const fs = require('node:fs');
const zlib = require('node:zlib');
const { parse } = require('csv-parse/sync');
const { resolveAwinPartKey } = require('./parseAwinKey');

/**
 * Some Awin feeds are gzip (or zip) even when saved as .csv — e.g. compression=none
 * on the marker but the productdata endpoint still returns gzip. Detect and unwrap.
 * @param {Buffer} buf
 * @returns {Buffer}
 */
function maybeDecompressFeed(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return buf;
  // gzip magic 1f 8b
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    return zlib.gunzipSync(buf);
  }
  // zip local file header PK\x03\x04 — extract first matching entry
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    return unzipFirstEntry(buf);
  }
  return buf;
}

/**
 * Minimal sync unzip: first non-directory entry (stored or deflate).
 * @param {Buffer} zip
 * @returns {Buffer}
 */
function unzipFirstEntry(zip) {
  let p = 0;
  while (p + 30 <= zip.length && zip.readUInt32LE(p) === 0x04034b50) {
    const method = zip.readUInt16LE(p + 8);
    const compSize = zip.readUInt32LE(p + 18);
    const nameLen = zip.readUInt16LE(p + 26);
    const extraLen = zip.readUInt16LE(p + 28);
    const name = zip.slice(p + 30, p + 30 + nameLen).toString('utf8');
    const dataStart = p + 30 + nameLen + extraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > zip.length) {
      const err = new Error('zip_truncated');
      err.code = 'zip_truncated';
      throw err;
    }
    if (!name.endsWith('/')) {
      const payload = zip.slice(dataStart, dataEnd);
      if (method === 0) return Buffer.from(payload);
      if (method === 8) return zlib.inflateRawSync(payload);
      const err = new Error('zip_method_unsupported');
      err.code = 'zip_method_unsupported';
      throw err;
    }
    p = dataEnd;
  }
  const err = new Error('zip_empty');
  err.code = 'zip_empty';
  throw err;
}

/**
 * Parse Awin product CSV into Parts-shaped rows (no Source/FeedKey/Env yet).
 * @param {string|Buffer} raw
 * @returns {object[]}
 */
function parseAwinPartsCsv(raw) {
  const buf = Buffer.isBuffer(raw) ? maybeDecompressFeed(raw) : Buffer.from(String(raw), 'utf8');
  const text = buf.toString('utf8');
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
    trim: true,
  });
  const out = [];
  for (const row of records) {
    const lower = {};
    for (const [k, v] of Object.entries(row)) {
      lower[String(k).trim().toLowerCase()] = v == null ? '' : String(v).trim();
    }
    const { merchantProductId, merchantSku } = resolveAwinPartKey(lower);
    if (!merchantProductId) continue;
    const priceRaw = lower.search_price || lower.store_price || lower.display_price || '';
    const priceNum = priceRaw === '' ? null : Number(String(priceRaw).replace(/[^0-9.-]/g, ''));
    const title = lower.product_name || lower.title || '';
    const url = lower.aw_deep_link || lower.merchant_deep_link || lower.deep_link || '';
    const image =
      lower.aw_image_url || lower.merchant_image_url || lower.image_url || '';
    const currency = (lower.currency || 'GBP').slice(0, 8) || 'GBP';
    const category = lower.merchant_category || lower.category_name || lower.category || '';
    const brand = lower.brand_name || lower.brand || lower.merchant_name || '';
    out.push({
      MerchantProductId: merchantProductId.slice(0, 256),
      MerchantSku: merchantSku.slice(0, 256),
      Title: title.slice(0, 512),
      Description: lower.description || '',
      Url: url.slice(0, 2048),
      ImageUrl: image.slice(0, 2048),
      Price: Number.isFinite(priceNum) ? priceNum : null,
      Currency: currency,
      Category: category.slice(0, 512),
      Brand: brand.slice(0, 256),
      ContentHash: `${merchantProductId}:${title}:${priceRaw}`.slice(0, 128),
    });
  }
  return out;
}

/**
 * @param {string|Buffer} raw
 * @returns {object[]}
 */
function parseAwinCouponsJson(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    const err = new Error('coupons_json_parse_failed');
    err.code = 'parse_error';
    throw err;
  }
  const offers = Array.isArray(doc.offers) ? doc.offers : Array.isArray(doc) ? doc : [];
  const out = [];
  for (const o of offers) {
    if (!o || o.promotionId == null) continue;
    const voucher = o.voucher || {};
    out.push({
      PromotionId: String(o.promotionId).slice(0, 64),
      Type: String(o.type || 'voucher').slice(0, 64),
      Title: String(o.title || '').slice(0, 512),
      Description: String(o.description || ''),
      Terms: String(o.terms || ''),
      Code: String(voucher.code || o.code || '').slice(0, 128),
      Url: String(o.url || '').slice(0, 2048),
      UrlTracking: String(o.urlTracking || '').slice(0, 2048),
      StartDate: o.startDate || null,
      EndDate: o.endDate || null,
      Status: String(o.status || '').slice(0, 64),
      Exclusive: Boolean(voucher.exclusive),
      Attributable: Boolean(voucher.attributable),
      RawJson: JSON.stringify(o),
    });
  }
  return out;
}

function readFileIfExists(p) {
  if (!p || !fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}

module.exports = {
  parseAwinPartsCsv,
  parseAwinCouponsJson,
  resolveAwinPartKey,
  readFileIfExists,
  maybeDecompressFeed,
};
