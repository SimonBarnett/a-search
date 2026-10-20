'use strict';

/**
 * FR #4701: per-advertiser application message within Rakuten AGENT.md char limit.
 */

/**
 * @param {{ name: string, mid?: string }} advertiser
 * @param {number} charLimit
 * @returns {{ ok: true, message: string } | { ok: false, code: string }}
 */
function buildApplicationMessage(advertiser, charLimit) {
  const name = String((advertiser && advertiser.name) || 'advertiser').trim();
  const mid = String((advertiser && advertiser.mid) || '').trim();
  const base =
    `Hello ${name}${mid ? ` (${mid})` : ''}: MMFC publisher 4766177 would like to ` +
    `partner for model flying / RC hobby and UK retail audiences.`;
  const limit = Number(charLimit) > 0 ? Number(charLimit) : 500;
  if (base.length <= limit) {
    return { ok: true, message: base };
  }
  const trimmed = base.slice(0, Math.max(0, limit));
  if (!trimmed.trim()) {
    return { ok: false, code: 'message_over_limit' };
  }
  // Unique per advertiser even when truncated.
  const uniq = `${trimmed.slice(0, Math.max(0, limit - 12))} [${(mid || name).slice(0, 8)}]`;
  if (uniq.length > limit) {
    return { ok: false, code: 'message_over_limit' };
  }
  return { ok: true, message: uniq };
}

/**
 * @param {string} message
 * @param {number} charLimit
 */
function assertMessageWithinLimit(message, charLimit) {
  const limit = Number(charLimit) > 0 ? Number(charLimit) : 500;
  if (String(message || '').length > limit) {
    const err = new Error('message_over_limit');
    err.code = 'message_over_limit';
    throw err;
  }
}

module.exports = {
  buildApplicationMessage,
  assertMessageWithinLimit,
};
