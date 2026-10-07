'use strict';

/**
 * Impact onboarding runOnce stub (FR-049d).
 * Live Impact join API is FR-051 — this returns an empty drain shape.
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
