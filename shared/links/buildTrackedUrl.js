'use strict';

/**
 * Shared tracked / affiliate URL builder (FR-057a).
 *
 * Stamps JWT `userId` as the tenant and injects required provider `.env`
 * account fields as query params. Never hardcode publisher IDs; never take
 * tenant from the request body (callers pass JWT claim only).
 *
 * Provider wiring is out of scope for FR-057a — see FR-057c..h.
 *
 * Prefer this path over `worker/lib/` (FR-047 shared layer home).
 */

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
 * Default env-key → query-param names for known a-search accounts.
 * Callers may override via `accountQueryMap`.
 */
const DEFAULT_ACCOUNT_QUERY_MAP = {
  AMAZON_PARTNER_TAG: 'tag',
  AWIN_PUBLISHER_ID: 'awinaffid',
  EBAY_CAMPAIGN_ID: 'campid',
  CJ_WEBSITE_ID: 'sid',
  RAKUTEN_SITE_ID: 'mid',
  IMPACT_CAMPAIGN_ID: 'subId1',
};

/**
 * @param {object} opts
 * @param {string} opts.url - Absolute http(s) product / offer URL
 * @param {string} opts.userId - JWT tenant claim (required, non-empty)
 * @param {string} [opts.env] - live|sandbox (stamped as a_search_env when set)
 * @param {Record<string, string|undefined>} opts.envVars - provider folder env
 * @param {string[]} opts.requiredAccountKeys - env keys that must be present
 * @param {Record<string, string>} [opts.accountQueryMap] - env key → query name
 * @param {string} [opts.tenantParam='userId'] - query param for the tenant
 * @returns {string}
 */
function buildTrackedUrl(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new TrackedUrlError('buildTrackedUrl requires an options object');
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
};
