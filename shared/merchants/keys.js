'use strict';

/**
 * FR #4008: a-merchants S3 key helpers.
 * Layout: {provider}/ , {provider}/{merchantid}/ , .../parts/{yyyy-mm-dd}.{ext}
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

function providerMarkerKey(provider) {
  return `${assertSlug(provider, 'provider')}/`;
}

function merchantMarkerKey(provider, merchantId) {
  return `${assertSlug(provider, 'provider')}/${assertSlug(merchantId, 'merchantid')}/`;
}

function providerJsonKey(provider) {
  return `${assertSlug(provider, 'provider')}/provider.json`;
}

function merchantJsonKey(provider, merchantId) {
  return `${assertSlug(provider, 'provider')}/${assertSlug(merchantId, 'merchantid')}/merchant.json`;
}

function agentMdKey(provider) {
  return `${assertSlug(provider, 'provider')}/AGENT.md`;
}

function partsPrefix(provider, merchantId) {
  return `${assertSlug(provider, 'provider')}/${assertSlug(merchantId, 'merchantid')}/parts/`;
}

function normalizeExt(ext) {
  const e =
    ext == null ? '' : String(ext).trim().toLowerCase().replace(/^\./, '');
  if (!e || !/^[a-z0-9._+-]+$/.test(e)) {
    const err = new Error('invalid_ext');
    err.code = 'invalid_ext';
    throw err;
  }
  return e;
}

function partsDatedKey(provider, merchantId, yyyyMmDd, ext) {
  const date = String(yyyyMmDd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const err = new Error('invalid_parts_date');
    err.code = 'invalid_parts_date';
    throw err;
  }
  return `${partsPrefix(provider, merchantId)}${date}.${normalizeExt(ext)}`;
}

/**
 * @param {{ format?: string }} meta
 * @returns {string}
 */
function extFromMeta(meta) {
  const format = String((meta && meta.format) || 'jsonl')
    .trim()
    .toLowerCase();
  if (!['csv', 'xml', 'json', 'jsonl'].includes(format)) {
    const err = new Error('invalid_format');
    err.code = 'invalid_format';
    throw err;
  }
  return format;
}

module.exports = {
  SLUG_RE,
  assertSlug,
  providerMarkerKey,
  merchantMarkerKey,
  providerJsonKey,
  merchantJsonKey,
  agentMdKey,
  partsPrefix,
  partsDatedKey,
  normalizeExt,
  extFromMeta,
};
