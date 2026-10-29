'use strict';

/**
 * FR-248: per-source outbound URL builder (widget /go click-time + API path).
 * Merchant -> URL unchanged. Affiliate/provider -> our id + tenantId slots.
 * Replace known network params rather than double-tag.
 */

const {
  getNetworkParams,
  DEFAULT_ACCOUNT_QUERY_MAP,
} = require('./networkParams');
const { resolveAmazonTag } = require('./amazonTag');
const { isPartner } = require('../partners/isPartner');

class TrackedUrlError extends Error {
  /**
   * @param {string} message
   * @param {string} [code]
   */
  constructor(message, code = 'tracked_url') {
    super(message);
    this.name = 'TrackedUrlError';
    this.code = code;
  }
}

/**
 * @param {string} source
 * @param {{
 *   url: string,
 *   tenantId: string,
 *   partnerId?: string|null,
 *   partnerUser?: object|null,
 *   clickId?: string|null,
 *   env?: string,
 *   envVars?: Record<string, string|undefined>,
 *   upgradedClub?: boolean,
 *   provisionedAmazonTags?: Set<string>|string[],
 *   log?: Function,
 * }} opts
 * @returns {string}
 */
function buildOutboundUrl(source, opts) {
  if (!opts || typeof opts !== 'object') {
    throw new TrackedUrlError('buildOutboundUrl requires options');
  }
  const src = String(source || '')
    .trim()
    .toLowerCase();
  const net = getNetworkParams(src);
  if (!net) {
    throw new TrackedUrlError(
      `unknown source for outbound URL: ${source}`,
      'tracked_url_unknown_source',
    );
  }

  const urlRaw = opts.url;
  if (urlRaw == null || String(urlRaw).trim() === '') {
    throw new TrackedUrlError(
      'outbound URL requires a non-empty absolute http(s) url',
      'tracked_url_bad_url',
    );
  }
  let parsed;
  try {
    parsed = new URL(String(urlRaw));
  } catch {
    throw new TrackedUrlError(
      `outbound URL is not a valid absolute URL: ${urlRaw}`,
      'tracked_url_bad_url',
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TrackedUrlError(
      `outbound URL must be http(s), got ${parsed.protocol}`,
      'tracked_url_bad_url',
    );
  }

  if (net.class === 'merchant') {
    return parsed.toString();
  }

  const tenantId = String(opts.tenantId || '').trim();
  if (!tenantId) {
    throw new TrackedUrlError(
      'outbound URL requires non-empty tenantId',
      'tracked_url_missing_userId',
    );
  }

  const envVars =
    opts.envVars && typeof opts.envVars === 'object' ? opts.envVars : {};

  // --- Amazon special tag ---
  if (src === 'amazon') {
    const baseTag = String(envVars.AMAZON_PARTNER_TAG || '').trim();
    if (!baseTag) {
      throw new TrackedUrlError(
        'missing required account env AMAZON_PARTNER_TAG for tracked URL (fail closed)',
        'tracked_url_missing_account',
      );
    }
    const resolved = resolveAmazonTag({
      tenantId,
      baseTag,
      upgraded: opts.upgradedClub === true,
      provisionedTags: opts.provisionedAmazonTags,
      log: opts.log,
    });
    parsed.searchParams.set('tag', resolved.tag);
    if (opts.env) parsed.searchParams.set('a_search_env', String(opts.env));
    return parsed.toString();
  }

  // Fail closed: require affiliate account when configured
  const affEnvs = Array.isArray(net.affiliateEnv)
    ? net.affiliateEnv
    : net.affiliateEnv
      ? [net.affiliateEnv]
      : [];
  for (const key of affEnvs) {
    // Impact: allow campaign+mp for path; at least one affiliate env required
    if (src === 'impact') {
      const mp = String(envVars.IMPACT_MEDIA_PARTNER_ID || '').trim();
      const camp = String(envVars.IMPACT_CAMPAIGN_ID || '').trim();
      if (!mp && !camp) {
        throw new TrackedUrlError(
          'missing Impact affiliate env IMPACT_MEDIA_PARTNER_ID or IMPACT_CAMPAIGN_ID (fail closed)',
          'tracked_url_missing_account',
        );
      }
      break;
    }
    const val = envVars[key];
    if (val == null || String(val).trim() === '') {
      throw new TrackedUrlError(
        `missing required account env ${key} for tracked URL (fail closed)`,
        'tracked_url_missing_account',
      );
    }
  }

  // CJ: ensure /click-{PID}- in path when possible; never put PID on sid
  if (src === 'cj') {
    const pid = String(envVars.CJ_WEBSITE_ID || '').trim();
    if (pid && !/\/click-\d+/i.test(parsed.pathname)) {
      // If URL is already a CJ deep link without our PID, leave path; else stamp sid only.
      // When path lacks click-PID, inject a note via query is wrong — keep path, require sid tenant.
    }
  }

  // Impact: ensure path has campaign when building from plain URL
  if (src === 'impact') {
    const mp = String(envVars.IMPACT_MEDIA_PARTNER_ID || '').trim();
    const ad = String(envVars.IMPACT_AD_ID || '0').trim() || '0';
    const camp = String(envVars.IMPACT_CAMPAIGN_ID || '').trim();
    if (mp && camp && !/\/c\/[^/]+\/[^/]+\/[^/]+/i.test(parsed.pathname)) {
      // Wrap destination: keep host if already impact/sjv, else use path template on same host
      const dest = parsed.toString();
      if (!/\.sjv\.io$|\.impact\.com$|impactradius/i.test(parsed.hostname)) {
        // Stash destination as `u` / `url` query on a synthetic path when env provides IMPACT_TRACKING_HOST
        const host =
          String(envVars.IMPACT_TRACKING_HOST || '').trim() ||
          'example.sjv.io';
        parsed = new URL(
          `https://${host}/c/${encodeURIComponent(mp)}/${encodeURIComponent(ad)}/${encodeURIComponent(camp)}`,
        );
        parsed.searchParams.set('u', dest);
      } else if (camp) {
        parsed.pathname = `/c/${encodeURIComponent(mp || '0')}/${encodeURIComponent(ad)}/${encodeURIComponent(camp)}`;
      }
    }
  }

  // Affiliate query params (replace)
  if (net.affiliateParam && affEnvs.length) {
    const key = Array.isArray(net.affiliateEnv)
      ? net.affiliateEnv[0]
      : net.affiliateEnv;
    if (key && envVars[key] != null && String(envVars[key]).trim() !== '') {
      parsed.searchParams.set(
        net.affiliateParam,
        String(envVars[key]).trim(),
      );
    }
  }
  if (net.extraAccountParams) {
    for (const [envKey, qName] of Object.entries(net.extraAccountParams)) {
      const v = envVars[envKey];
      if (v != null && String(v).trim() !== '') {
        parsed.searchParams.set(qName, String(v).trim());
      }
    }
  }

  // Ebay standard EPN params
  if (src === 'ebay') {
    parsed.searchParams.set('mkcid', '1');
    parsed.searchParams.set('toolid', '10001');
    parsed.searchParams.set('mkevt', '1');
    if (envVars.EBAY_MKRID) {
      parsed.searchParams.set('mkrid', String(envVars.EBAY_MKRID).trim());
    }
  }

  // Partnerize pubref path segment style: also set query pubref
  if (src === 'partnerize' && net.tenantParam === 'pubref') {
    // Prefer query pubref:{tenant} pattern via searchParams
  }

  // Tenant slot
  if (net.tenantParam) {
    let tenantVal = tenantId;
    if (src === 'partnerize') {
      tenantVal = tenantId.startsWith('pubref:')
        ? tenantId
        : tenantId;
    }
    parsed.searchParams.set(net.tenantParam, tenantVal);
  }

  // Partner slot only when permissions contain partner
  const partnerId =
    opts.partnerId != null ? String(opts.partnerId).trim() : '';
  const partnerOk =
    partnerId &&
    (opts.partnerUser
      ? isPartner(opts.partnerUser)
      : opts.partnerIsPartner === true);
  if (partnerOk && net.partnerParam) {
    parsed.searchParams.set(net.partnerParam, partnerId);
  } else if (net.partnerParam) {
    parsed.searchParams.delete(net.partnerParam);
  }

  const clickId =
    opts.clickId != null ? String(opts.clickId).trim() : '';
  if (clickId && net.clickIdParam) {
    parsed.searchParams.set(net.clickIdParam, clickId.slice(0, 64));
  }

  // Strip legacy wrong tenant param
  parsed.searchParams.delete('userId');

  if (opts.env != null && String(opts.env).trim() !== '') {
    parsed.searchParams.set('a_search_env', String(opts.env).trim());
  }

  return parsed.toString();
}

module.exports = {
  buildOutboundUrl,
  TrackedUrlError,
  DEFAULT_ACCOUNT_QUERY_MAP,
};
