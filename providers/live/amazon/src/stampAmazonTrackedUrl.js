'use strict';

/**
 * FR-185 + FR-248: Amazon Associates tagging for PA-API and Creators offer URLs.
 * Upgraded clubs may use per-tenant tag; others use AMAZON_PARTNER_TAG base.
 */

const { buildTrackedUrl } = require('../../../../shared/links/buildTrackedUrl');

/**
 * @param {{
 *   url: string,
 *   userId: string,
 *   env?: string,
 *   envVars?: Record<string, string|undefined>,
 *   upgradedClub?: boolean,
 *   provisionedAmazonTags?: Set<string>|string[],
 *   log?: Function,
 * }} opts
 * @returns {string}
 */
function stampAmazonTrackedUrl(opts) {
  return buildTrackedUrl({
    url: opts.url,
    userId: opts.userId,
    env: opts.env,
    envVars: opts.envVars || {},
    source: 'amazon',
    upgradedClub: opts.upgradedClub,
    provisionedAmazonTags: opts.provisionedAmazonTags,
    log: opts.log,
  });
}

module.exports = { stampAmazonTrackedUrl };
