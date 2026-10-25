'use strict';

/**
 * Shared defaultage resolver (FR #4931 / #4929 / #4916).
 * Precedence: merchant (affiliate) > provider > root (_root/).
 * Accepts lowercase metadata key `defaultage` as a positive integer (whole days).
 * Invalid values (empty, 0, negative, non-integer) fall through to the next tier.
 * Missing all tiers after _root self-heal -> NeedsDefaultAgeError.
 * Missing `_root/` object: create-only put (If-None-Match: *) with defaultage=7.
 * Existing `_root/` with missing/invalid defaultage is never overwritten.
 *
 * Due check (affiliates download / runDaily): empty or unparseable `lastdownload`
 * counts as due; otherwise due when age in UTC days >= defaultage.
 */

class NeedsDefaultAgeError extends Error {
  /**
   * @param {string} [message]
   */
  constructor(message) {
    super(
      message ||
        'needs_defaultage: set defaultage on s3://a-affiliates/_root/ (merchant > provider > root)',
    );
    this.name = 'NeedsDefaultAgeError';
    this.code = 'needs_defaultage';
  }
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
function coerceMeta(raw) {
  const out = Object.create(null);
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).trim().toLowerCase();
    if (!key || v == null) continue;
    out[key] = String(v);
  }
  return out;
}

/**
 * Parse one defaultage value. Only positive integers count.
 * @param {unknown} raw
 * @returns {number|null}
 */
function parseDefaultAge(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Reject non-integers (e.g. "7.5", "1e2") and non-numeric.
  if (!/^[0-9]+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/**
 * @param {{
 *   affiliateMeta?: Record<string, string>|null,
 *   merchantMeta?: Record<string, string>|null,
 *   providerMeta?: Record<string, string>|null,
 *   rootMeta?: Record<string, string>|null,
 * }} opts
 * @returns {number}
 */
function resolveDefaultAge(opts) {
  const o = opts || {};
  const tiers = [
    coerceMeta(o.affiliateMeta != null ? o.affiliateMeta : o.merchantMeta),
    coerceMeta(o.providerMeta),
    coerceMeta(o.rootMeta),
  ];
  for (const meta of tiers) {
    const n = parseDefaultAge(meta.defaultage);
    if (n != null) return n;
  }
  throw new NeedsDefaultAgeError();
}

/**
 * True when the affiliate/merchant is due for refresh based on lastdownload.
 * @param {Record<string, string>|null|undefined} meta
 * @param {Date|string|number} now
 * @param {number} days positive whole days from resolveDefaultAge
 * @returns {boolean}
 */
/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isMissingObject(err) {
  if (!err) return false;
  const status = err.$metadata && err.$metadata.httpStatusCode;
  const code = String(err.name || err.Code || err.code || '');
  return (
    status === 404 ||
    code === 'NotFound' ||
    code === 'NoSuchKey' ||
    code === 'NotFound'
  );
}

/**
 * Load `_root/` metadata. If the marker is missing, create it once with
 * defaultage=7 (never overwrite an existing object).
 * @param {object} s3
 * @param {string} bucket
 * @param {{ log?: Function, rootKey?: string }} [opts]
 * @returns {Promise<Record<string, string>>}
 */
async function ensureRootDefaultAge(s3, bucket, opts) {
  const log = (opts && opts.log) || (() => {});
  const key = (opts && opts.rootKey) || '_root/';
  try {
    const head = await s3.headObject({ Bucket: bucket, Key: key });
    const meta = coerceMeta(head.Metadata);
    if (parseDefaultAge(meta.defaultage) == null) {
      throw new NeedsDefaultAgeError(
        'needs_defaultage: existing _root/ defaultage is missing or invalid',
      );
    }
    return meta;
  } catch (err) {
    if (err && err.code === 'needs_defaultage') throw err;
    if (!isMissingObject(err)) throw err;
  }
  try {
    await s3.putObject({
      Bucket: bucket,
      Key: key,
      Body: '',
      IfNoneMatch: '*',
      Metadata: { defaultage: '7' },
    });
    log('self_heal _root/ defaultage=7');
    return coerceMeta({ defaultage: '7' });
  } catch (err) {
    const status = err && err.$metadata && err.$metadata.httpStatusCode;
    const code = String(err.name || err.Code || err.code || '');
    if (status !== 412 && code !== 'PreconditionFailed') throw err;
    const head = await s3.headObject({ Bucket: bucket, Key: key });
    const meta = coerceMeta(head.Metadata);
    if (parseDefaultAge(meta.defaultage) == null) {
      throw new NeedsDefaultAgeError(
        'needs_defaultage: existing _root/ defaultage is missing or invalid',
      );
    }
    return meta;
  }
}

function isDueByLastDownload(meta, now, days) {
  const d =
    Number.isFinite(Number(days)) && Number(days) > 0
      ? Math.floor(Number(days))
      : 0;
  if (d <= 0) return true;
  const m = coerceMeta(meta);
  const raw = m.lastdownload != null ? String(m.lastdownload).trim() : '';
  if (!raw) return true;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return true;
  const nowMs =
    now instanceof Date
      ? now.getTime()
      : now != null && now !== ''
        ? new Date(now).getTime()
        : Date.now();
  if (!Number.isFinite(nowMs)) return true;
  return nowMs - t >= d * 86400000;
}

module.exports = {
  NeedsDefaultAgeError,
  parseDefaultAge,
  resolveDefaultAge,
  isDueByLastDownload,
  coerceMeta,
  ensureRootDefaultAge,
  isMissingObject,
};
