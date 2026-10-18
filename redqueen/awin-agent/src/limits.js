'use strict';

/**
 * FR #4123: daily invite/join caps.
 */

/**
 * @param {{ maxInvites?: number, maxJoins?: number, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {{ maxInvites: number, maxJoins: number }}
 */
function resolveDailyLimits(opts = {}) {
  const env = opts.env || process.env;
  const maxInvites = clampInt(
    opts.maxInvites != null ? opts.maxInvites : env.AWIN_AGENT_MAX_INVITES,
    20,
  );
  const maxJoins = clampInt(
    opts.maxJoins != null ? opts.maxJoins : env.AWIN_AGENT_MAX_JOINS,
    20,
  );
  return { maxInvites, maxJoins };
}

/**
 * @param {unknown} value
 * @param {number} fallback
 */
function clampInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

/**
 * @param {string[]} ids
 * @param {number} max
 * @returns {string[]}
 */
function takeUpTo(ids, max) {
  const list = Array.isArray(ids) ? ids : [];
  const m = Math.max(0, Number(max) || 0);
  return list.slice(0, m);
}

module.exports = { resolveDailyLimits, takeUpTo };
