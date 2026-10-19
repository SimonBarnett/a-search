'use strict';

/**
 * FR #4463: map raw feed records to canonical columns via provider.json mapping.
 */

const crypto = require('node:crypto');

const CANONICAL = [
  'sku',
  'title',
  'description',
  'brand',
  'category',
  'price',
  'currency',
  'url',
  'image_url',
  'gtin',
  'ean',
  'mpn',
  'availability',
];

/**
 * @param {unknown} raw
 * @param {string} pathExpr e.g. $.variants[0].price or plain column
 */
function getByPath(raw, pathExpr) {
  const expr = String(pathExpr || '');
  if (!expr) return undefined;
  if (!expr.startsWith('$.') && !expr.startsWith('$[')) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw[expr];
    }
    return undefined;
  }
  let cur = raw;
  const parts = expr.replace(/^\$\.?/, '').split('.');
  for (const part of parts) {
    if (cur == null) return undefined;
    const m = /^([^\[\]]+)(?:\[(\d+)\])?$/.exec(part);
    if (!m) return undefined;
    cur = cur[m[1]];
    if (m[2] != null) {
      const idx = Number(m[2]);
      cur = Array.isArray(cur) ? cur[idx] : undefined;
    }
  }
  return cur;
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toDecimal(s) {
  const n = Number(String(s || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {unknown} value
 * @param {unknown[]} transforms
 * @param {Record<string, string>} ctx
 */
function applyTransforms(value, transforms, ctx) {
  let v = value;
  const list = Array.isArray(transforms) ? transforms : [];
  for (const t of list) {
    if (t === 'trim') v = String(v == null ? '' : v).trim();
    else if (t === 'stripHtml') v = stripHtml(v);
    else if (t === 'decimal') v = toDecimal(v);
    else if (t === 'lower') v = String(v == null ? '' : v).toLowerCase();
    else if (t === 'upper') v = String(v == null ? '' : v).toUpperCase();
    else if (t === 'firstNonEmpty') {
      /* handled at from-array level */
    } else if (t && typeof t === 'object' && t.template) {
      let out = String(t.template);
      out = out.replace(/\{value\}/g, String(v == null ? '' : v));
      out = out.replace(/\{shopdomain\}/g, String(ctx.shopdomain || ''));
      out = out.replace(/\{(\w+)\}/g, (_, k) => String(ctx[k] || ''));
      v = out;
    }
  }
  return v;
}

/**
 * @param {Record<string, unknown>} raw
 * @param {object} mappingSpec { from, transform?, default? }
 * @param {Record<string, string>} ctx
 */
function mapOneField(raw, mappingSpec, ctx) {
  if (!mappingSpec || typeof mappingSpec !== 'object') return undefined;
  const from = mappingSpec.from;
  let value;
  if (Array.isArray(from)) {
    for (const f of from) {
      const got = getByPath(raw, f);
      if (got != null && String(got).trim() !== '') {
        value = got;
        break;
      }
    }
  } else {
    value = getByPath(raw, from);
  }
  if ((value == null || String(value).trim() === '') && mappingSpec.default != null) {
    value = mappingSpec.default;
  }
  return applyTransforms(value, mappingSpec.transform, ctx);
}

/**
 * @param {Record<string, unknown>} raw
 * @param {object} providerJson
 * @param {Record<string, string>} [ctx]
 */
function mapRecord(raw, providerJson, ctx = {}) {
  const mapping = (providerJson && providerJson.mapping) || {};
  const out = {};
  for (const key of CANONICAL) {
    if (!mapping[key]) continue;
    out[key] = mapOneField(raw, mapping[key], ctx);
  }
  return out;
}

/**
 * @param {Record<string, unknown>} canonical
 */
function contentHash(canonical) {
  const payload = CANONICAL.map((k) => `${k}=${canonical[k] == null ? '' : canonical[k]}`).join(
    '\n',
  );
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Redact secret-shaped tokens from a string (FAKE_ / EXAMPLE stay).
 * @param {string} s
 */
function redactSecrets(s) {
  return String(s || '')
    .replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer FAKE_REDACTED')
    .replace(
      /\b(password|token|secret|api[_-]?key)\s*[:=]\s*\S+/gi,
      '$1=FAKE_REDACTED',
    );
}

module.exports = {
  CANONICAL,
  getByPath,
  mapRecord,
  contentHash,
  redactSecrets,
  stripHtml,
  toDecimal,
};
