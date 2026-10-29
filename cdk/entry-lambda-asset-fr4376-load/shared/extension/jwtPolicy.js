'use strict';

/**
 * #1344: JWT must live in chrome.storage.session only -- never localStorage or page DOM.
 */

const JWT_STORAGE = 'chrome.storage.session';

/** Forbidden browser storage APIs for the a-search JWT. */
const FORBIDDEN_JWT_SINKS = Object.freeze([
  'localStorage',
  'sessionStorage',
  'document.cookie',
]);

/**
 * Source-level guard used by pins: extension scripts must not reference forbidden sinks
 * for JWT persistence (allow comments that mention the rule).
 * @param {string} source
 * @returns {string[]} violation snippets
 */
function findJwtStorageViolations(source) {
  const text = String(source || '');
  /** @type {string[]} */
  const hits = [];
  for (const sink of FORBIDDEN_JWT_SINKS) {
    const re = new RegExp(
      '(?:setItem|getItem|removeItem|\\.|\\[)\\s*[\'"]?' +
        sink.replace('.', '\\.') +
        '|(?:^|[^a-zA-Z])' +
        sink.replace('.', '\\.') +
        '\\s*\\.',
      'm',
    );
    // Simpler: flag localStorage.setItem / sessionStorage. / document.cookie assignments
  }
  if (/\blocalStorage\s*\./.test(text) || /\blocalStorage\s*\[/.test(text)) {
    hits.push('localStorage');
  }
  if (/\bsessionStorage\s*\./.test(text) || /\bsessionStorage\s*\[/.test(text)) {
    hits.push('sessionStorage');
  }
  if (/document\.cookie\s*=/.test(text)) {
    hits.push('document.cookie');
  }
  return hits;
}

module.exports = {
  JWT_STORAGE,
  FORBIDDEN_JWT_SINKS,
  findJwtStorageViolations,
};
