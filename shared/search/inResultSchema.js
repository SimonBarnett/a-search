'use strict';

/**
 * FR #4030: shared a-clubs IN/ result schema for provider Lambdas and redqueen SQL drain.
 * File key: {hostkey}/{guid}/IN/{searchid}-{source}.json
 */

const IN_SOURCES = Object.freeze(['sql', 'ebay', 'amazon', 'etsy', 'rakuten', 'cj', 'awin', 'impact', 'aliexpress', 'bol', 'kelkoo', 'skimlinks']);

/**
 * @param {unknown} value
 * @returns {string}
 */
function requireSeg(value) {
  const s = value == null ? '' : String(value).trim();
  if (!s || s.includes('..') || s.includes('/') || s.includes('\\')) {
    const err = new Error('invalid_in_path_segment');
    err.code = 'invalid_in_path_segment';
    throw err;
  }
  return s;
}

/**
 * @param {{ hostkey: string, guid: string, searchid: string, source: string }} parts
 * @returns {string}
 */
function inResultKey(parts) {
  const hostkey = requireSeg(parts && parts.hostkey);
  const guid = requireSeg(parts && parts.guid);
  const searchid = requireSeg(parts && parts.searchid);
  const source = requireSeg(parts && parts.source).toLowerCase();
  return `${hostkey}/${guid}/IN/${searchid}-${source}.json`;
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: object } | { ok: false, error: string, fields?: string[] }}
 */
function validateInResult(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'invalid_in_result', fields: ['body'] };
  }
  /** @type {Record<string, unknown>} */
  const o = /** @type {Record<string, unknown>} */ (raw);
  const fields = [];
  const searchid = o.searchid == null ? o.searchId : o.searchid;
  const source = o.source;
  const hostkey = o.hostkey == null ? o.host : o.hostkey;
  const guid = o.guid == null ? o.widgetGuid : o.guid;
  if (searchid == null || String(searchid).trim() === '') fields.push('searchid');
  if (source == null || String(source).trim() === '') fields.push('source');
  if (hostkey == null || String(hostkey).trim() === '') fields.push('hostkey');
  if (guid == null || String(guid).trim() === '') fields.push('guid');
  if (!Array.isArray(o.products) && !Array.isArray(o.parts)) fields.push('products');
  if (fields.length) return { ok: false, error: 'invalid_in_result', fields };

  const products = Array.isArray(o.products)
    ? o.products
    : Array.isArray(o.parts)
      ? o.parts
      : [];

  /** @type {Record<string, unknown>} */
  const value = {
    searchid: String(searchid).trim(),
    source: String(source).trim().toLowerCase(),
    hostkey: String(hostkey).trim(),
    guid: String(guid).trim(),
    products,
    queries: Array.isArray(o.queries) ? o.queries : undefined,
    exclude: Array.isArray(o.exclude) ? o.exclude : undefined,
  };
  // FR #4562: optional vendor status (non-JSON HTML etc.) on the IN body.
  if (o.status && typeof o.status === 'object' && !Array.isArray(o.status)) {
    value.status = o.status;
  }
  return { ok: true, value };
}

/**
 * Build a valid IN body from job + products.
 * @param {{
 *   searchid: string,
 *   source: string,
 *   hostkey: string,
 *   guid: string,
 *   products?: object[],
 *   queries?: unknown[],
 *   exclude?: unknown[],
 *   status?: object,
 * }} opts
 */
function buildInResult(opts) {
  const v = validateInResult({
    searchid: opts.searchid,
    source: opts.source,
    hostkey: opts.hostkey,
    guid: opts.guid,
    products: Array.isArray(opts.products) ? opts.products : [],
    queries: opts.queries,
    exclude: opts.exclude,
    status: opts.status,
  });
  if (!v.ok) {
    const err = new Error(v.error);
    err.code = v.error;
    err.fields = v.fields;
    throw err;
  }
  return v.value;
}

module.exports = {
  IN_SOURCES,
  inResultKey,
  validateInResult,
  buildInResult,
};
