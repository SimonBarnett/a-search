'use strict';

/**
 * FR #4008: S3 ObjectCreated on merchant markers -> immediate one-merchant download.
 * Also accepts affiliate markers when event bucket is the affiliates bucket
 * (shared handler pattern).
 */

const { downloadOne } = require('./downloadOne');
const { downloadAffiliateOne } = require('./downloadAffiliateOne');

const MERCHANT_MARKER_RE = /^([a-z0-9._-]+)\/([a-z0-9._-]+)\/$/;

/**
 * Decode S3 event key (plus-encoded spaces).
 * @param {unknown} key
 * @returns {string}
 */
function decodeKey(key) {
  const raw = key == null ? '' : String(key);
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return raw;
  }
}

/**
 * @param {string} key
 * @returns {{ provider: string, id: string } | null}
 */
function parseEntityMarkerKey(key) {
  const k = String(key || '');
  // Ignore provider markers, AGENT.md, json overflow, parts files.
  if (k.endsWith('AGENT.md') || k.endsWith('.json') || k.includes('/parts/')) {
    return null;
  }
  const m = MERCHANT_MARKER_RE.exec(k);
  if (!m) return null;
  return { provider: m[1], id: m[2] };
}

/**
 * @param {object} event
 * @param {{
 *   s3: object,
 *   bucket?: string,
 *   affiliatesBucket?: string,
 *   fetchImpl?: Function,
 *   now?: Date,
 *   keep?: number,
 * }} deps
 */
async function onCreated(event, deps) {
  const records = (event && event.Records) || [];
  /** @type {object[]} */
  const results = [];
  let processed = 0;

  for (const rec of records) {
    const bucket =
      (rec && rec.s3 && rec.s3.bucket && rec.s3.bucket.name) ||
      (deps && deps.bucket) ||
      process.env.A_MERCHANTS_BUCKET ||
      'a-merchants';
    const key = decodeKey(rec && rec.s3 && rec.s3.object && rec.s3.object.key);
    const parsed = parseEntityMarkerKey(key);
    if (!parsed) continue;

    const affiliatesBucket =
      (deps && deps.affiliatesBucket) ||
      process.env.A_AFFILIATES_BUCKET ||
      '';
    const isAffiliate =
      affiliatesBucket && String(bucket) === String(affiliatesBucket);

    processed += 1;
    if (isAffiliate) {
      const r = await downloadAffiliateOne({
        s3: deps.s3,
        bucket,
        provider: parsed.provider,
        affiliateId: parsed.id,
        fetchImpl: deps.fetchImpl,
        now: deps.now,
      });
      results.push({ bucket, kind: 'affiliate', ...r });
    } else {
      const r = await downloadOne({
        s3: deps.s3,
        bucket,
        provider: parsed.provider,
        merchantId: parsed.id,
        fetchImpl: deps.fetchImpl,
        now: deps.now,
        keep: deps.keep,
      });
      results.push({ bucket, kind: 'merchant', ...r });
    }
  }

  return { processed, results };
}

module.exports = {
  onCreated,
  parseEntityMarkerKey,
  decodeKey,
};
