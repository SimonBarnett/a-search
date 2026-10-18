'use strict';

/**
 * FR #4001: parse affiliate parts files (csv|json|xml) with optional gzip/zip.
 */

const zlib = require('node:zlib');
const { normalizePartKey } = require('./partKey');

/**
 * @param {Buffer|string} raw
 * @param {{ compression?: string }} meta
 * @returns {Buffer}
 */
function decompress(raw, meta) {
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw), 'utf8');
  const c = String(meta.compression || 'none').toLowerCase();
  if (c === 'none' || c === '' || c === 'identity') return buf;
  if (c === 'gzip' || c === 'gz') return zlib.gunzipSync(buf);
  if (c === 'zip') {
    const err = new Error('zip_not_supported_in_unit_path');
    err.code = 'zip_not_supported';
    throw err;
  }
  const err = new Error(`unsupported_compression:${c}`);
  err.code = 'unsupported_compression';
  throw err;
}

/**
 * Minimal CSV: header row with partid/id + optional title,url,price columns.
 * @param {string} text
 * @param {{ provider: string, affiliateid: string }} ctx
 */
function parseCsv(text, ctx) {
  const lines = String(text)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idIdx = headers.findIndex((h) =>
    ['partid', 'part_id', 'id', 'productid', 'merchantproductid'].includes(h),
  );
  if (idIdx < 0) {
    const err = new Error('csv_missing_partid_column');
    err.code = 'parse_error';
    throw err;
  }
  const titleIdx = headers.indexOf('title');
  const urlIdx = headers.indexOf('url');
  const priceIdx = headers.indexOf('price');
  const out = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(',');
    const partid = String(cols[idIdx] || '').trim();
    if (!partid) continue;
    const key = normalizePartKey({
      provider: ctx.provider,
      affiliateid: ctx.affiliateid,
      partid,
    });
    out.push({
      ...key,
      Title: titleIdx >= 0 ? String(cols[titleIdx] || '').trim() : '',
      Url: urlIdx >= 0 ? String(cols[urlIdx] || '').trim() : '',
      Price: priceIdx >= 0 ? Number(cols[priceIdx]) || null : null,
    });
  }
  return out;
}

/**
 * @param {string} text
 * @param {{ provider: string, affiliateid: string }} ctx
 */
function parseJson(text, ctx) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    const err = new Error('json_parse_failed');
    err.code = 'parse_error';
    throw err;
  }
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.parts)
      ? raw.parts
      : Array.isArray(raw.items)
        ? raw.items
        : null;
  if (!rows) {
    const err = new Error('json_missing_parts_array');
    err.code = 'parse_error';
    throw err;
  }
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const partid =
      row.partid || row.partId || row.id || row.merchantProductId || '';
    if (!partid) continue;
    const key = normalizePartKey({
      provider: ctx.provider,
      affiliateid: ctx.affiliateid,
      partid,
    });
    out.push({
      ...key,
      Title: String(row.title || row.Title || ''),
      Url: String(row.url || row.Url || ''),
      Price:
        row.price != null || row.Price != null
          ? Number(row.price != null ? row.price : row.Price)
          : null,
    });
  }
  return out;
}

/**
 * Tiny XML path: <part id="..."> or <product><id>...</id></product>
 * @param {string} text
 * @param {{ provider: string, affiliateid: string }} ctx
 */
function parseXml(text, ctx) {
  const out = [];
  const idAttr = /<(?:part|product)\b[^>]*\bid=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = idAttr.exec(text))) {
    const key = normalizePartKey({
      provider: ctx.provider,
      affiliateid: ctx.affiliateid,
      partid: m[1],
    });
    out.push({ ...key, Title: '', Url: '', Price: null });
  }
  if (out.length) return out;
  const idTag =
    /<(?:part|product)\b[^>]*>[\s\S]*?<(?:id|partid|PartId)>([^<]+)<\/(?:id|partid|PartId)>/gi;
  while ((m = idTag.exec(text))) {
    const key = normalizePartKey({
      provider: ctx.provider,
      affiliateid: ctx.affiliateid,
      partid: m[1].trim(),
    });
    out.push({ ...key, Title: '', Url: '', Price: null });
  }
  return out;
}

/**
 * @param {Buffer|string} raw
 * @param {{
 *   provider: string,
 *   affiliateid: string,
 *   format?: string,
 *   compression?: string,
 * }} meta
 */
function parseAffiliateFeed(raw, meta) {
  const buf = decompress(raw, meta);
  const text = buf.toString('utf8');
  const format = String(meta.format || 'csv').toLowerCase();
  const ctx = {
    provider: meta.provider,
    affiliateid: meta.affiliateid,
  };
  if (format === 'csv') return parseCsv(text, ctx);
  if (format === 'json') return parseJson(text, ctx);
  if (format === 'xml') return parseXml(text, ctx);
  const err = new Error(`unsupported_format:${format}`);
  err.code = 'unsupported_format';
  throw err;
}

module.exports = {
  decompress,
  parseAffiliateFeed,
  parseCsv,
  parseJson,
  parseXml,
};
