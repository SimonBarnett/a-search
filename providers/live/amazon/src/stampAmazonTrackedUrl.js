'use strict';

/**
 * FR-185: shared Amazon Associates tagging for PA-API and Creators offer URLs.
 * Same JWT userId tenant + AMAZON_PARTNER_TAG rules (S17 / FR-057).
 */

const { buildTrackedUrl } = require('../../../../shared/links/buildTrackedUrl');

/**
 * @param {{
 *   url: string,
 *   userId: string,
 *   env?: string,
 *   envVars?: Record<string, string|undefined>,
 * }} opts
 * @returns {string}
 */
function stampAmazonTrackedUrl(opts) {
  return buildTrackedUrl({
    url: opts.url,
    userId: opts.userId,
    env: opts.env,
    envVars: opts.envVars || {},
    requiredAccountKeys: ['AMAZON_PARTNER_TAG'],
  });
}

module.exports = { stampAmazonTrackedUrl };
