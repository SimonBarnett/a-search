'use strict';

/**
 * FR #4107: known embed/iframe host patterns.
 * Start with Wix HTML-component frames (*.filesusr.com). Add other builders
 * only after confirming them from real traffic (do not guess).
 */

/** @type {ReadonlyArray<{ id: string, test: (host: string) => boolean }>} */
const EMBED_HOST_PATTERNS = Object.freeze([
  {
    id: 'wix-filesusr',
    test: (host) => {
      const h = String(host || '').toLowerCase();
      return h === 'filesusr.com' || h.endsWith('.filesusr.com');
    },
  },
]);

/**
 * @param {string} host normalised hostname (no scheme)
 * @returns {boolean}
 */
function isEmbedFrameHost(host) {
  const h = host == null ? '' : String(host).toLowerCase().trim();
  if (!h) return false;
  for (const p of EMBED_HOST_PATTERNS) {
    if (p.test(h)) return true;
  }
  return false;
}

/**
 * Which known pattern matched, if any.
 * @param {string} host
 * @returns {string|null}
 */
function matchEmbedPatternId(host) {
  const h = host == null ? '' : String(host).toLowerCase().trim();
  if (!h) return null;
  for (const p of EMBED_HOST_PATTERNS) {
    if (p.test(h)) return p.id;
  }
  return null;
}

module.exports = {
  EMBED_HOST_PATTERNS,
  isEmbedFrameHost,
  matchEmbedPatternId,
};
