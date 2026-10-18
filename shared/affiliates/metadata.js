'use strict';

/**
 * FR #3999: provider + affiliate S3 user-metadata normalize/validate.
 * Secrets never logged; stripe* keys forbidden on affiliates.
 */

const { assertSlug } = require('./keys');

const PROVIDER_KEYS = Object.freeze([
  'name',
  'loginurl',
  'apibase',
  'publisherid',
  'username',
  'password',
  'apitoken',
  'authtype',
  'lastmod',
]);

const AFFILIATE_KEYS = Object.freeze([
  'affiliateid',
  'name',
  'awinmid',
  'feedurl',
  'feedid',
  'format',
  'compression',
  'schedule',
  'enabled',
  'disabledreason',
  'lastdownload',
  'laststatus',
  'lastsize',
  'lastmod',
]);

const FORBIDDEN_AFFILIATE_KEYS = Object.freeze([
  'stripeaccountid',
  'stripecustomerid',
]);

const AUTH_TYPES = Object.freeze(['password', 'token', 'oauth']);
const FORMATS = Object.freeze(['csv', 'xml', 'json']);
const COMPRESSIONS = Object.freeze(['gzip', 'zip', 'none']);
const SECRET_META_KEYS = Object.freeze(['password', 'apitoken', 'username']);

/** Soft limit for S3 user metadata payload (~2 KiB). */
const METADATA_SOFT_MAX_BYTES = 2048;

/**
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
function coerceStringMap(raw) {
  const out = Object.create(null);
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).trim().toLowerCase();
    if (!key) continue;
    if (v == null) continue;
    out[key] = String(v);
  }
  return out;
}

/**
 * @param {Record<string, string>} meta
 * @returns {number}
 */
function metadataByteLength(meta) {
  let n = 0;
  for (const [k, v] of Object.entries(meta || {})) {
    n += Buffer.byteLength(String(k), 'utf8');
    n += Buffer.byteLength(String(v), 'utf8');
  }
  return n;
}

/**
 * @param {unknown} raw
 * @param {{ now?: Date }} [opts]
 * @returns {Record<string, string>}
 */
function normalizeProviderMeta(raw, opts) {
  const src = coerceStringMap(raw);
  const out = Object.create(null);
  for (const key of PROVIDER_KEYS) {
    if (src[key] != null && String(src[key]).length > 0) {
      out[key] = String(src[key]);
    }
  }
  if (out.authtype) {
    const a = out.authtype.trim().toLowerCase();
    if (!AUTH_TYPES.includes(a)) {
      const err = new Error('invalid_authtype');
      err.code = 'invalid_authtype';
      throw err;
    }
    out.authtype = a;
  }
  if (!out.lastmod) {
    const now = (opts && opts.now) || new Date();
    out.lastmod = now.toISOString();
  }
  return out;
}

/**
 * @param {unknown} raw
 * @param {{ now?: Date, affiliateId?: string }} [opts]
 * @returns {Record<string, string>}
 */
function normalizeAffiliateMeta(raw, opts) {
  const src = coerceStringMap(raw);
  for (const bad of FORBIDDEN_AFFILIATE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(src, bad)) {
      const err = new Error('stripe_fields_forbidden');
      err.code = 'stripe_fields_forbidden';
      throw err;
    }
  }
  for (const key of Object.keys(src)) {
    if (key.startsWith('stripe')) {
      const err = new Error('stripe_fields_forbidden');
      err.code = 'stripe_fields_forbidden';
      throw err;
    }
  }

  const out = Object.create(null);
  for (const key of AFFILIATE_KEYS) {
    if (src[key] != null && String(src[key]).length > 0) {
      out[key] = String(src[key]);
    }
  }

  const idHint = (opts && opts.affiliateId) || out.affiliateid;
  if (idHint) {
    out.affiliateid = assertSlug(idHint, 'affiliateid');
  }

  if (out.format) {
    const f = out.format.trim().toLowerCase();
    if (!FORMATS.includes(f)) {
      const err = new Error('invalid_format');
      err.code = 'invalid_format';
      throw err;
    }
    out.format = f;
  } else {
    out.format = 'csv';
  }

  if (out.compression) {
    const c = out.compression.trim().toLowerCase();
    if (!COMPRESSIONS.includes(c)) {
      const err = new Error('invalid_compression');
      err.code = 'invalid_compression';
      throw err;
    }
    out.compression = c;
  } else {
    out.compression = 'none';
  }

  if (!out.schedule) out.schedule = 'weekly';

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

  // FR #4113 / #4123: allow marker updates without feed when:
  // - laststatus=missing_feedurl (downloadOne stamp), or
  // - enabled=0 and disabledreason=nofeed (Awin agent follow-up).
  // enabled=1 still requires feedurl or feedid.
  if (!out.feedurl && !out.feedid) {
    const status = String(out.laststatus || '')
      .trim()
      .toLowerCase();
    const enabled = String(out.enabled || '').trim();
    const reason = String(out.disabledreason || '')
      .trim()
      .toLowerCase();
    const allowEmpty =
      status === 'missing_feedurl' ||
      (enabled === '0' && reason === 'nofeed');
    if (!allowEmpty) {
      const err = new Error('feedurl_or_feedid_required');
      err.code = 'feedurl_or_feedid_required';
      throw err;
    }
  }

  if (!out.lastmod) {
    const now = (opts && opts.now) || new Date();
    out.lastmod = now.toISOString();
  }

  return out;
}

/**
 * Merge patch onto existing affiliate meta; strip stripe keys; bump lastmod.
 * Preserves unknown non-stripe keys (weekly bump must not drop them).
 * @param {Record<string, string>} existing
 * @param {Record<string, string>} patch
 * @param {{ now?: Date }} [opts]
 * @returns {Record<string, string>}
 */
function mergeAffiliateMeta(existing, patch, opts) {
  const base = coerceStringMap(existing);
  const over = coerceStringMap(patch);
  for (const bad of FORBIDDEN_AFFILIATE_KEYS) {
    delete base[bad];
    delete over[bad];
  }
  for (const key of Object.keys(base)) {
    if (key.startsWith('stripe')) delete base[key];
  }
  for (const key of Object.keys(over)) {
    if (key.startsWith('stripe')) delete over[key];
  }
  const merged = { ...base, ...over };
  const now = (opts && opts.now) || new Date();
  merged.lastmod = now.toISOString();
  const normalized = normalizeAffiliateMeta(merged, {
    now,
    affiliateId: merged.affiliateid,
  });
  // Re-attach extra keys normalizeAffiliateMeta does not know about.
  for (const [k, v] of Object.entries(merged)) {
    if (Object.prototype.hasOwnProperty.call(normalized, k)) continue;
    if (FORBIDDEN_AFFILIATE_KEYS.includes(k) || k.startsWith('stripe')) continue;
    normalized[k] = v;
  }
  return normalized;
}

/**
 * Safe object for logs: secret values replaced, never echoed.
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
function redactForLog(raw) {
  const src = coerceStringMap(raw);
  const out = Object.create(null);
  for (const [k, v] of Object.entries(src)) {
    if (SECRET_META_KEYS.includes(k) || k.includes('password') || k.includes('token') || k.includes('secret')) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

module.exports = {
  PROVIDER_KEYS,
  AFFILIATE_KEYS,
  FORBIDDEN_AFFILIATE_KEYS,
  AUTH_TYPES,
  FORMATS,
  COMPRESSIONS,
  SECRET_META_KEYS,
  METADATA_SOFT_MAX_BYTES,
  coerceStringMap,
  metadataByteLength,
  normalizeProviderMeta,
  normalizeAffiliateMeta,
  mergeAffiliateMeta,
  redactForLog,
};
