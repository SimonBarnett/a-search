'use strict';

/**
 * Awin onboarding runOnce stub (FR-049c).
 * Live Awin join API is FR-050 — this returns an empty drain shape.
 *
 * @param {object} [deps]
 * @returns {Promise<{ processed: number, remaining: number, signups: object[] }>}
 */
async function runOnce(_deps = {}) {
  return {
    processed: 0,
    remaining: 0,
    signups: [],
  };
}

module.exports = { runOnce };
