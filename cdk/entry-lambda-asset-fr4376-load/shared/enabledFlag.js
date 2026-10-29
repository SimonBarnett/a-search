'use strict';

/**
 * Shared 0/1 enabled flag helper (GUID folders, a-affiliates provider folders).
 * Missing / unknown => disabled (0). Only literal 1 / '1' is enabled.
 */

/**
 * @param {unknown} raw
 * @returns {0|1}
 */
function parseEnabledFlag(raw) {
  return raw === 1 || raw === '1' ? 1 : 0;
}

/**
 * True when metadata.enabled is exactly 1 / '1'. Missing => false.
 * @param {Record<string, unknown>|null|undefined} meta
 * @returns {boolean}
 */
function isEnabledOne(meta) {
  return parseEnabledFlag(meta && meta.enabled) === 1;
}

module.exports = {
  parseEnabledFlag,
  isEnabledOne,
};
