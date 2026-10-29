'use strict';

/**
 * FR-244: Etsy affiliate deep-link wrapper (Rakuten default; Awin fallback).
 * Cleans listing URL then wraps; fail closed — never emit raw listing URL when
 * tracking is required. tenantId = JWT userId (API) or club via /go (FR-248).
 */

const {
  TrackedUrlError,
} = require('../../../../shared/links/buildTrackedUrl');

/**
 * Strip query + fragment so we do not double-tag (catalog-model Part2).
 * @param {string} url
 * @returns {string}
 */
function cleanListingUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    throw new TrackedUrlError(
      `etsy affiliate URL is not a valid absolute URL: ${url}`,
      'tracked_url_bad_url',
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TrackedUrlError(
      `etsy affiliate URL must be http(s), got ${parsed.protocol}`,
      'tracked_url_bad_url',
    );
  }
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

/**
 * @param {Record<string, string|undefined>} envVars
 * @returns {'rakuten'|'awin'}
 */
function resolveAffiliateNetwork(envVars) {
  const e = envVars || {};
  const raw = String(e.ETSY_AFFILIATE_NETWORK || 'rakuten')
    .trim()
    .toLowerCase();
  if (raw === 'awin') return 'awin';
  return 'rakuten';
}

/**
 * Publisher id for Rakuten LinkShare deep links.
 * Prefer ETSY-scoped / RAKUTEN_PUBLISHER_ID; fall back to RAKUTEN_SITE_ID.
 * @param {Record<string, string|undefined>} envVars
 */
function resolveRakutenPublisherId(envVars) {
  const e = envVars || {};
  const v =
    e.RAKUTEN_PUBLISHER_ID ||
    e.RAKUTEN_SITE_ID ||
    e.RAKUTEN_AFFILIATE_ID ||
    '';
  return String(v).trim();
}

/**
 * Build Etsy outbound affiliate URL.
 * @param {{
 *   url: string,
 *   userId: string,
 *   envVars?: Record<string, string|undefined>,
 *   env?: string,
 * }} opts
 * @returns {string}
 */
function buildEtsyAffiliateUrl(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new TrackedUrlError('buildEtsyAffiliateUrl requires options');
  }
  const userId = opts.userId;
  if (userId == null || String(userId).trim() === '') {
    throw new TrackedUrlError(
      'etsy affiliate URL requires non-empty JWT userId / tenantId',
      'tracked_url_missing_userId',
    );
  }
  const cleaned = cleanListingUrl(opts.url);
  const envVars = opts.envVars && typeof opts.envVars === 'object' ? opts.envVars : {};
  const network = resolveAffiliateNetwork(envVars);

  if (network === 'awin') {
    const mid = String(envVars.ETSY_AWIN_MID || '').trim();
    const aff = String(envVars.AWIN_PUBLISHER_ID || '').trim();
    if (!mid || !aff) {
      throw new TrackedUrlError(
        'missing ETSY_AWIN_MID and/or AWIN_PUBLISHER_ID for Etsy awin mode (fail closed)',
        'tracked_url_missing_account',
      );
    }
    const u = new URL('https://www.awin1.com/cread.php');
    u.searchParams.set('awinmid', mid);
    u.searchParams.set('awinaffid', aff);
    u.searchParams.set('clickref', String(userId).trim());
    u.searchParams.set('ued', cleaned);
    return u.toString();
  }

  // rakuten (default)
  const pubId = resolveRakutenPublisherId(envVars);
  const mid = String(envVars.ETSY_RAKUTEN_MID || '').trim();
  if (!pubId || !mid) {
    throw new TrackedUrlError(
      'missing RAKUTEN_PUBLISHER_ID (or RAKUTEN_SITE_ID) and/or ETSY_RAKUTEN_MID for Etsy rakuten mode (fail closed)',
      'tracked_url_missing_account',
    );
  }
  const u = new URL('https://click.linksynergy.com/deeplink');
  u.searchParams.set('id', pubId);
  u.searchParams.set('mid', mid);
  u.searchParams.set('murl', cleaned);
  u.searchParams.set('u1', String(userId).trim());
  return u.toString();
}

module.exports = {
  cleanListingUrl,
  resolveAffiliateNetwork,
  resolveRakutenPublisherId,
  buildEtsyAffiliateUrl,
  TrackedUrlError,
};
