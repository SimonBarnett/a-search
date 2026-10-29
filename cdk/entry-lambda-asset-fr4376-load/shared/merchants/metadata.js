'use strict';

/**
 * FR #4008: provider + merchant S3 user-metadata normalize/validate.
 * Secrets never logged; Stripe customer/subscription ids allowed (merchants pay us).
 */

const { assertSlug } = require('./keys');

const PROVIDER_KEYS = Object.freeze([
  'name',
  'apibase',
  'apiversion',
  'appclientid',
  'instructions',
  'lastmod',
]);

const MERCHANT_KEYS = Object.freeze([
  'merchantid',
  'name',
  'apikey',
  'apisecret',
  'accesstoken',
  'shopdomain',
  'stripecustomerid',
  'stripesubscriptionid',
  'email',
  'format',
  'enabled',
  'lastdownload',
  'laststatus',
  'lastsize',
  'lastmod',
  'lastimport',
  'importstatus',
  'feedurl',
]);

const FORMATS = Object.freeze(['csv', 'xml', 'json', 'jsonl']);

const SECRET_META_KEYS = Object.freeze([
  'apikey',
  'apisecret',
  'accesstoken',
  'password',
  'apitoken',
  'email',
]);

/** Soft limit for S3 user metadata payload (~2 KiB). */
const METADATA_SOFT_MAX_BYTES = 2048;

function coerceStringMap(raw) {
  const out = Object.create(null);
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).trim().toLowerCase();
    if (!key || v == null) continue;
    out[key] = String(v);
  }
  return out;
}

function metadataByteLength(meta) {
  let n = 0;
  for (const [k, v] of Object.entries(meta || {})) {
    n += Buffer.byteLength(String(k), 'utf8');
    n += Buffer.byteLength(String(v), 'utf8');
  }
  return n;
}

function normalizeProviderMeta(raw, opts) {
  const src = coerceStringMap(raw);
  const out = Object.create(null);
  for (const key of PROVIDER_KEYS) {
    if (src[key] != null && String(src[key]).length > 0) {
      out[key] = String(src[key]);
    }
  }
  if (!out.instructions) out.instructions = 'AGENT.md';
  if (!out.lastmod) {
    const now = (opts && opts.now) || new Date();
    out.lastmod = now.toISOString();
  }
  return out;
}

function normalizeMerchantMeta(raw, opts) {
  const src = coerceStringMap(raw);
  const out = Object.create(null);
  for (const key of MERCHANT_KEYS) {
    if (src[key] != null && String(src[key]).length > 0) {
      out[key] = String(src[key]);
    }
  }

  const idHint = (opts && opts.merchantId) || out.merchantid;
  if (idHint) out.merchantid = assertSlug(idHint, 'merchantid');

  if (out.format) {
    const f = out.format.trim().toLowerCase();
    if (!FORMATS.includes(f)) {
      const err = new Error('invalid_format');
      err.code = 'invalid_format';
      throw err;
    }
    out.format = f;
  } else {
    out.format = 'jsonl';
  }

  if (out.enabled == null || out.enabled === '') {
    out.enabled = '1';
  } else {
    const e = String(out.enabled).trim();
    if (e !== '0' && e !== '1') {
      const err = new Error('invalid_enabled');
      err.code = 'invalid_enabled';
      throw err;
    }
    out.enabled = e;
  }

  if (!out.lastmod) {
    const now = (opts && opts.now) || new Date();
    out.lastmod = now.toISOString();
  }

  return out;
}

/**
 * Merge patch onto existing merchant meta; bump lastmod.
 * Preserves unknown keys (weekly bump must not drop them).
 */
function mergeMerchantMeta(existing, patch, opts) {
  const base = coerceStringMap(existing);
  const over = coerceStringMap(patch);
  const merged = { ...base, ...over };
  const now = (opts && opts.now) || new Date();
  merged.lastmod = now.toISOString();
  const normalized = normalizeMerchantMeta(merged, {
    now,
    merchantId: merged.merchantid,
  });
  for (const [k, v] of Object.entries(merged)) {
    if (Object.prototype.hasOwnProperty.call(normalized, k)) continue;
    normalized[k] = v;
  }
  return normalized;
}

/**
 * Safe object for logs: secret values replaced, never echoed.
 */
function redactForLog(raw) {
  const src = coerceStringMap(raw);
  const out = Object.create(null);
  for (const [k, v] of Object.entries(src)) {
    if (
      SECRET_META_KEYS.includes(k) ||
      k.includes('password') ||
      k.includes('token') ||
      k.includes('secret') ||
      k.includes('apikey') ||
      k === 'email'
    ) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

module.exports = {
  PROVIDER_KEYS,
  MERCHANT_KEYS,
  FORMATS,
  SECRET_META_KEYS,
  METADATA_SOFT_MAX_BYTES,
  coerceStringMap,
  metadataByteLength,
  normalizeProviderMeta,
  normalizeMerchantMeta,
  mergeMerchantMeta,
  redactForLog,
};
