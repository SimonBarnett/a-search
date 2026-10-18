'use strict';

/**
 * Shared tracked / affiliate URL builder (FR-057a + FR-248).
 *
 * Prefer `source` + buildOutboundUrl (per-network tenant slots). Legacy callers
 * without `source` keep query stamping via accountQueryMap / tenantParam.
 * JWT userId (or clubId on /go) is the tenant; never hardcode publisher
 * account ids - read them from provider .env / Secrets Manager only.
 */

const {
  DEFAULT_ACCOUNT_QUERY_MAP: NETWORK_ACCOUNT_MAP,
} = require('./networkParams');
const {
  buildOutboundUrl,
  TrackedUrlError,
} = require('./buildOutboundUrl');

/** @deprecated use networkParams.DEFAULT_ACCOUNT_QUERY_MAP - kept for FR-057 tests */
const DEFAULT_ACCOUNT_QUERY_MAP = {
  ...NETWORK_ACCOUNT_MAP,
};

/**
 * @param {object} opts
 * @param {string} opts.url
 * @param {string} opts.userId - JWT tenant claim (API path) or clubId
 * @param {string} [opts.source] - registry source id (FR-248)
 * @param {string} [opts.env]
 * @param {Record<string, string|undefined>} opts.envVars
 * @param {string[]} [opts.requiredAccountKeys]
 * @param {Record<string, string>} [opts.accountQueryMap]
 * @param {string} [opts.tenantParam]
 * @param {string} [opts.partnerId]
 * @param {string} [opts.clickId]
 * @param {object} [opts.partnerUser]
 * @param {boolean} [opts.upgradedClub]
 * @param {Set<string>|string[]} [opts.provisionedAmazonTags]
 * @param {Function} [opts.log]
 * @returns {string}
 */
function buildTrackedUrl(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new TrackedUrlError('buildTrackedUrl requires an options object');
  }

  if (opts.source != null && String(opts.source).trim() !== '') {
    return buildOutboundUrl(String(opts.source).trim(), {
      url: opts.url,
      tenantId: opts.userId,
      partnerId: opts.partnerId,
      partnerUser: opts.partnerUser,
      partnerIsPartner: opts.partnerIsPartner,
      clickId: opts.clickId,
      env: opts.env,
      envVars: opts.envVars,
      upgradedClub: opts.upgradedClub,
      provisionedAmazonTags: opts.provisionedAmazonTags,
      log: opts.log,
    });
  }

  const userId = opts.userId;
  if (userId == null || String(userId).trim() === '') {
    throw new TrackedUrlError(
      'tracked URL requires non-empty JWT userId tenant',
      'tracked_url_missing_userId',
    );
  }

  const urlRaw = opts.url;
  if (urlRaw == null || String(urlRaw).trim() === '') {
    throw new TrackedUrlError(
      'tracked URL requires a non-empty absolute http(s) url',
      'tracked_url_bad_url',
    );
  }

  let parsed;
  try {
    parsed = new URL(String(urlRaw));
  } catch {
    throw new TrackedUrlError(
      `tracked URL is not a valid absolute URL: ${urlRaw}`,
      'tracked_url_bad_url',
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TrackedUrlError(
      `tracked URL must be http(s), got ${parsed.protocol}`,
      'tracked_url_bad_url',
    );
  }

  const envVars = opts.envVars && typeof opts.envVars === 'object' ? opts.envVars : {};
  const required = Array.isArray(opts.requiredAccountKeys)
    ? opts.requiredAccountKeys
    : [];
  if (required.length === 0) {
    throw new TrackedUrlError(
      'requiredAccountKeys must list at least one provider .env account key',
      'tracked_url_missing_account',
    );
  }

  const accountMap = {
    ...DEFAULT_ACCOUNT_QUERY_MAP,
    ...(opts.accountQueryMap && typeof opts.accountQueryMap === 'object'
      ? opts.accountQueryMap
      : {}),
  };

  for (const key of required) {
    const val = envVars[key];
    if (val == null || String(val).trim() === '') {
      throw new TrackedUrlError(
        `missing required account env ${key} for tracked URL (fail closed)`,
        'tracked_url_missing_account',
      );
    }
  }

  const tenantParam =
    opts.tenantParam == null || String(opts.tenantParam).trim() === ''
      ? 'userId'
      : String(opts.tenantParam);

  parsed.searchParams.set(tenantParam, String(userId).trim());

  for (const key of required) {
    const param = accountMap[key] || key.toLowerCase();
    parsed.searchParams.set(param, String(envVars[key]).trim());
  }

  if (opts.env != null && String(opts.env).trim() !== '') {
    parsed.searchParams.set('a_search_env', String(opts.env).trim());
  }

  return parsed.toString();
}

module.exports = {
  TrackedUrlError,
  DEFAULT_ACCOUNT_QUERY_MAP,
  buildTrackedUrl,
  buildOutboundUrl,
};
