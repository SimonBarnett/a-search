'use strict';

/**
 * FR-227: Secrets Manager *names* for OAuth shortlist adapters.
 * Values are never stored in git -- deploy-time only.
 */

const SHORTLIST_IDS = Object.freeze([
  'x',
  'github',
  'facebook',
  'google',
  'instagram',
]);

/**
 * @param {string} providerId
 * @returns {{ clientId: string, clientSecret: string }}
 */
function secretNamesFor(providerId) {
  const id = String(providerId || '')
    .trim()
    .toLowerCase();
  if (!id) {
    throw new Error('provider_id_required');
  }
  return {
    clientId: `a-search/auth/${id}/client-id`,
    clientSecret: `a-search/auth/${id}/client-secret`,
  };
}

module.exports = {
  SHORTLIST_IDS,
  secretNamesFor,
};
