'use strict';

/**
 * FR-234: checked-in bot User-Agent substrings (case-insensitive).
 * Keep ASCII-only; expand via PR when ops add patterns.
 */

const BOT_UA_SUBSTRINGS = [
  'bot',
  'spider',
  'crawler',
  'slurp',
  'bingpreview',
  'facebookexternalhit',
  'headlesschrome',
  'phantomjs',
  'selenium',
];

/**
 * @param {string|null|undefined} userAgent
 * @returns {boolean}
 */
function isBotUserAgent(userAgent) {
  const ua = userAgent == null ? '' : String(userAgent).trim().toLowerCase();
  if (!ua) return true;
  for (const needle of BOT_UA_SUBSTRINGS) {
    if (ua.includes(needle)) return true;
  }
  return false;
}

module.exports = {
  BOT_UA_SUBSTRINGS,
  isBotUserAgent,
};
