'use strict';

/**
 * FR-248: Amazon Associates tag selection.
 * Upgraded clubs (active widget_upgrade) get {store}-{lower(tenantId)}-21 when
 * provisioned in AmazonTrackingIds; else base AMAZON_PARTNER_TAG + log.
 */

/**
 * Derive store prefix from base tag, e.g. mymodelflying-21 -> mymodelflying
 * @param {string} baseTag
 */
function storePrefixFromBaseTag(baseTag) {
  const t = String(baseTag || '').trim();
  const m = t.match(/^(.+)-21$/i);
  return m ? m[1] : t.replace(/-21$/i, '') || t;
}

/**
 * @param {{
 *   tenantId: string,
 *   baseTag: string,
 *   upgraded?: boolean,
 *   provisionedTags?: Set<string>|string[]|Record<string, boolean>,
 *   log?: (code: string, detail?: object) => void,
 * }} opts
 * @returns {{ tag: string, usedTenantTag: boolean, missing?: boolean }}
 */
function resolveAmazonTag(opts) {
  const baseTag = String((opts && opts.baseTag) || '').trim();
  if (!baseTag) {
    const err = new Error('AMAZON_PARTNER_TAG missing');
    err.code = 'tracked_url_missing_account';
    throw err;
  }
  const tenantId = String((opts && opts.tenantId) || '')
    .trim()
    .toUpperCase();
  const upgraded = opts && opts.upgraded === true;
  if (!upgraded || !tenantId) {
    return { tag: baseTag, usedTenantTag: false };
  }
  const store = storePrefixFromBaseTag(baseTag);
  const want = `${store}-${tenantId.toLowerCase()}-21`;
  let provisioned = false;
  const p = opts.provisionedTags;
  if (p instanceof Set) provisioned = p.has(want);
  else if (Array.isArray(p)) provisioned = p.map(String).includes(want);
  else if (p && typeof p === 'object') provisioned = Boolean(p[want]);

  if (provisioned) {
    return { tag: want, usedTenantTag: true };
  }
  if (typeof opts.log === 'function') {
    opts.log('amazon_tag_missing', { tenantId, want, baseTag });
  }
  return { tag: baseTag, usedTenantTag: false, missing: true };
}

/**
 * Ops alert when provisioned count crosses AMAZON_TAG_ALERT_AT (default 50).
 * Idempotent: returns whether this crossing should fire the SNS alarm.
 * @param {{ count: number, alertAt?: number, alreadyAlerted?: boolean }} opts
 */
function shouldAlertAmazonTagLimit(opts) {
  const count = Number(opts && opts.count) || 0;
  const alertAt =
    opts && opts.alertAt != null ? Number(opts.alertAt) : 50;
  if (opts && opts.alreadyAlerted) return false;
  return count >= alertAt;
}

module.exports = {
  storePrefixFromBaseTag,
  resolveAmazonTag,
  shouldAlertAmazonTagLimit,
};
