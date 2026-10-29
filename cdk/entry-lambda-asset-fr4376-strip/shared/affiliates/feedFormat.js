'use strict';

/**
 * FR #4195: resolve affiliate feed format/compression for download (decompressed
 * object under {provider}/{affiliateid}/{yyyy-mm-dd}.{ext}).
 */

const { assertSlug, normalizeExt } = require('./keys');
const { coerceStringMap } = require('./metadata');

const FORMATS = Object.freeze(['csv', 'tsv', 'xml', 'json']);
const COMPRESSIONS = Object.freeze(['gzip', 'zip', 'none']);

const CONTENT_TYPES = Object.freeze({
  csv: 'text/csv; charset=utf-8',
  tsv: 'text/tab-separated-values; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  json: 'application/json; charset=utf-8',
});

/**
 * @param {Record<string, string>|null|undefined} affiliateMeta
 * @param {Record<string, string>|null|undefined} providerMeta
 * @returns {{
 *   ok: true, format: string, compression: string, ext: string, contentType: string
 * } | {
 *   ok: false, status: 'unsupported_format'|'unsupported_compression'
 * }}
 */
function resolveFeedFormat(affiliateMeta, providerMeta) {
  const aff = coerceStringMap(affiliateMeta);
  const prov = coerceStringMap(providerMeta);
  const formatRaw = String(aff.format || prov.format || 'csv')
    .trim()
    .toLowerCase();
  const compressionRaw = String(aff.compression || prov.compression || 'none')
    .trim()
    .toLowerCase();
  const compression =
    compressionRaw === '' || compressionRaw === 'none' ? 'none' : compressionRaw;

  if (!FORMATS.includes(formatRaw)) {
    return { ok: false, status: 'unsupported_format' };
  }
  if (!COMPRESSIONS.includes(compression)) {
    return { ok: false, status: 'unsupported_compression' };
  }
  return {
    ok: true,
    format: formatRaw,
    compression,
    ext: formatRaw,
    contentType: CONTENT_TYPES[formatRaw],
  };
}

/**
 * @param {unknown} provider
 * @param {unknown} affiliateId
 * @param {string} yyyyMmDd
 * @param {string} ext
 * @returns {string}
 */
function feedDatedKey(provider, affiliateId, yyyyMmDd, ext) {
  const p = assertSlug(provider, 'provider');
  const a = assertSlug(affiliateId, 'affiliateid');
  const date = String(yyyyMmDd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const err = new Error('invalid_feed_date');
    err.code = 'invalid_feed_date';
    throw err;
  }
  const e = normalizeExt(ext);
  return `${p}/${a}/${date}.${e}`;
}

module.exports = {
  FORMATS,
  COMPRESSIONS,
  CONTENT_TYPES,
  resolveFeedFormat,
  feedDatedKey,
};
