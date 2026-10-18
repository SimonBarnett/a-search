'use strict';

/**
 * FR #3999: a-affiliates S3 key helpers.
 * Layout: {provider}/ , {provider}/{affiliateid}/ , .../parts/{yyyy-mm-dd}.{ext}
 */

const SLUG_RE = /^[a-z0-9._-]+$/;

/**
 * @param {unknown} value
 * @param {string} [label]
 * @returns {string}
 */
function assertSlug(value, label) {
  const name = label || 'slug';
  const s = value == null ? '' : String(value).trim().toLowerCase();
  if (!s || !SLUG_RE.test(s) || s === '.' || s === '..' || s.includes('..')) {
    const err = new Error(`invalid_${name}`);
    err.code = `invalid_${name}`;
    throw err;
  }
  return s;
}

/**
 * @param {unknown} provider
 * @returns {string}
 */
function providerMarkerKey(provider) {
  const p = assertSlug(provider, 'provider');
  return `${p}/`;
}

/**
 * @param {unknown} provider
 * @param {unknown} affiliateId
 * @returns {string}
 */
function affiliateMarkerKey(provider, affiliateId) {
  const p = assertSlug(provider, 'provider');
  const a = assertSlug(affiliateId, 'affiliateid');
  return `${p}/${a}/`;
}

/**
 * @param {unknown} provider
 * @returns {string}
 */
function providerJsonKey(provider) {
  const p = assertSlug(provider, 'provider');
  return `${p}/provider.json`;
}

/**
 * @param {unknown} provider
 * @param {unknown} affiliateId
 * @returns {string}
 */
function partsPrefix(provider, affiliateId) {
  const p = assertSlug(provider, 'provider');
  const a = assertSlug(affiliateId, 'affiliateid');
  return `${p}/${a}/parts/`;
}

/**
 * @param {unknown} provider
 * @param {unknown} affiliateId
 * @param {string} yyyyMmDd
 * @param {string} ext
 * @returns {string}
 */
function partsDatedKey(provider, affiliateId, yyyyMmDd, ext) {
  const date = String(yyyyMmDd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const err = new Error('invalid_parts_date');
    err.code = 'invalid_parts_date';
    throw err;
  }
  const e = normalizeExt(ext);
  return `${partsPrefix(provider, affiliateId)}${date}.${e}`;
}

/**
 * @param {unknown} provider
 * @param {unknown} affiliateId
 * @param {string} ext
 * @returns {string}
 */
function partsLatestKey(provider, affiliateId, ext) {
  const e = normalizeExt(ext);
  return `${partsPrefix(provider, affiliateId)}latest.${e}`;
}

/**
 * @param {unknown} ext
 * @returns {string}
 */
function normalizeExt(ext) {
  const e = ext == null ? '' : String(ext).trim().toLowerCase().replace(/^\./, '');
  if (!e || !/^[a-z0-9._+-]+$/.test(e)) {
    const err = new Error('invalid_ext');
    err.code = 'invalid_ext';
    throw err;
  }
  return e;
}

/**
 * Build file extension from affiliate format + compression.
 * @param {{ format?: string, compression?: string }} meta
 * @returns {string}
 */
function extFromMeta(meta) {
  const format = String((meta && meta.format) || 'csv')
    .trim()
    .toLowerCase();
  const compression = String((meta && meta.compression) || 'none')
    .trim()
    .toLowerCase();
  if (!['csv', 'xml', 'json'].includes(format)) {
    const err = new Error('invalid_format');
    err.code = 'invalid_format';
    throw err;
  }
  if (compression === 'gzip') return `${format}.gz`;
  if (compression === 'zip') return `${format}.zip`;
  if (compression === 'none' || compression === '') return format;
  const err = new Error('invalid_compression');
  err.code = 'invalid_compression';
  throw err;
}

module.exports = {
  SLUG_RE,
  assertSlug,
  providerMarkerKey,
  affiliateMarkerKey,
  providerJsonKey,
  partsPrefix,
  partsDatedKey,
  partsLatestKey,
  normalizeExt,
  extFromMeta,
};
