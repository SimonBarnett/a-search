'use strict';

/**
 * #1344 Chrome extension DNS gate helpers (testable without Chrome).
 * enabled only when Club TXT present (FR-200 / Simon 14:35 rule).
 */

/**
 * @param {{ enabled?: boolean, clubId?: string|null, partnerId?: string|null }|null|undefined} status
 * @returns {boolean}
 */
function shouldInjectTopBar(status) {
  if (!status || typeof status !== 'object') return false;
  return status.enabled === true && status.clubId != null && String(status.clubId).trim() !== '';
}

/**
 * Re-check gate only when host changes (SPA navigation).
 * @param {string|null|undefined} prevHost
 * @param {string|null|undefined} nextHost
 */
function hostChanged(prevHost, nextHost) {
  return String(prevHost || '').toLowerCase() !== String(nextHost || '').toLowerCase();
}

module.exports = {
  shouldInjectTopBar,
  hostChanged,
};
