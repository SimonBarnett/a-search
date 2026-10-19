'use strict';

/**
 * FR #4463: parse feed bytes using provider.json format + map to canonical rows.
 */

const { parseDelimitedRecords } = require('./rfc4180');
const { mapRecord, contentHash, redactSecrets } = require('./mapRow');

/**
 * @param {Buffer|string} raw
 * @param {object} providerJson
 * @param {{ feedKey: string, shopdomain?: string, encoding?: string }} ctx
 */
function decodeText(raw, providerJson, ctx) {
  const enc = String(
    (ctx && ctx.encoding) || providerJson.encoding || 'utf-8',
  ).toLowerCase();
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw), 'utf8');
  if (enc === 'utf-16le') return buf.toString('utf16le');
  // windows-1252 / iso-8859-1: treat as latin1 for unit path (Node has no 1252 without iconv)
  if (enc === 'windows-1252' || enc === 'iso-8859-1') return buf.toString('latin1');
  return buf.toString('utf8');
}

/**
 * Minimal XML item extractor for /rss/channel/item style feeds.
 * @param {string} text
 * @param {string} recordPath
 */
function parseXmlRecords(text, recordPath) {
  const path = String(recordPath || '/rss/channel/item');
  const tag = path.split('/').filter(Boolean).pop() || 'item';
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const records = [];
  let m;
  while ((m = re.exec(text))) {
    const body = m[1];
    const fields = {};
    const fieldRe = /<([A-Za-z0-9:_-]+)>([\s\S]*?)<\/\1>/g;
    let fm;
    while ((fm = fieldRe.exec(body))) {
      fields[fm[1]] = String(fm[2] || '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .trim();
    }
    records.push(fields);
  }
  return { headers: Object.keys(records[0] || {}), records };
}

/**
 * @param {Buffer|string} raw
 * @param {object} providerJson
 * @param {{ feedKey: string, shopdomain?: string }} [ctx]
 */
function parseAndMapFeed(raw, providerJson, ctx = {}) {
  const format = String(providerJson.format || 'csv').toLowerCase();
  const text = decodeText(raw, providerJson, ctx);
  let headers = [];
  let records = [];

  if (format === 'csv' || format === 'tsv') {
    const delim =
      (providerJson.csv && providerJson.csv.delimiter) ||
      (format === 'tsv' ? '\t' : ',');
    const quote = (providerJson.csv && providerJson.csv.quote) || '"';
    const parsed = parseDelimitedRecords(text, {
      delimiter: delim,
      quote,
      header: providerJson.csv ? providerJson.csv.header !== false : true,
    });
    headers = parsed.headers;
    records = parsed.records;
  } else if (format === 'jsonl') {
    const lines = text
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((l) => l.trim());
    records = lines.map((l) => JSON.parse(l.replace(/^\uFEFF/, '')));
    headers = Object.keys(records[0] || {});
  } else if (format === 'json') {
    const data = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (Array.isArray(data)) records = data;
    else if (data && Array.isArray(data.products)) records = data.products;
    else if (data && Array.isArray(data.items)) records = data.items;
    else {
      const err = new Error('json_missing_records');
      err.code = 'parse_error';
      throw err;
    }
    headers = Object.keys(records[0] || {});
  } else if (format === 'xml') {
    const parsed = parseXmlRecords(
      text,
      (providerJson.xml && providerJson.xml.recordPath) || '/rss/channel/item',
    );
    headers = parsed.headers;
    records = parsed.records;
  } else {
    const err = new Error(`unsupported_format:${format}`);
    err.code = 'parse_error';
    throw err;
  }

  const expected = (providerJson.validation && providerJson.validation.expectedColumns) || [];
  if (expected.length) {
    const have = new Set(headers.map((h) => String(h).toLowerCase()));
    const missing = expected.filter((c) => !have.has(String(c).toLowerCase()));
    // jsonl/json: expected may be top-level keys of first object
    if (missing.length && (format === 'csv' || format === 'tsv' || format === 'xml')) {
      const err = new Error(`schema_drift:missing:${missing.join(',')}`);
      err.code = 'schema_drift';
      err.missing = missing;
      throw err;
    }
    if (missing.length && (format === 'json' || format === 'jsonl')) {
      const sampleKeys = new Set(Object.keys(records[0] || {}));
      const miss2 = expected.filter((c) => !sampleKeys.has(c));
      if (miss2.length) {
        const err = new Error(`schema_drift:missing:${miss2.join(',')}`);
        err.code = 'schema_drift';
        err.missing = miss2;
        throw err;
      }
    }
  }

  const required = providerJson.requiredFields || ['sku', 'title', 'url'];
  const staged = [];
  const rejects = [];
  const seen = new Map();

  for (let i = 0; i < records.length; i += 1) {
    const mapped = mapRecord(records[i], providerJson, {
      shopdomain: ctx.shopdomain || '',
      feedKey: ctx.feedKey || '',
    });
    const missingReq = required.filter(
      (f) => mapped[f] == null || String(mapped[f]).trim() === '',
    );
    if (missingReq.length) {
      rejects.push({
        rowNum: i + 1,
        reason: 'missing_required',
        detail: missingReq.join(','),
        rawRow: redactSecrets(JSON.stringify(records[i]).slice(0, 4000)),
      });
      continue;
    }
    const sku = String(mapped.sku);
    if (seen.has(sku)) {
      rejects.push({
        rowNum: i + 1,
        reason: 'duplicate_key',
        detail: sku,
        rawRow: redactSecrets(JSON.stringify(records[i]).slice(0, 4000)),
      });
    }
    seen.set(sku, {
      ...mapped,
      MerchantProductId: sku,
      ContentHash: contentHash(mapped),
      rowNum: i + 1,
    });
  }

  for (const row of seen.values()) staged.push(row);

  return {
    headers,
    rowsRead: records.length,
    staged,
    rejects,
  };
}

module.exports = { parseAndMapFeed, decodeText, parseXmlRecords };
