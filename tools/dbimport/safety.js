'use strict';

const DEFAULT_MAX_REMOVE_RATIO = 0.5;

/**
 * @param {{
 *   parsedCount: number,
 *   existingActiveCount: number,
 *   wouldRemoveCount: number,
 *   maxRemoveRatio?: number,
 * }} opts
 */
function checkSafetyGuard(opts) {
  const maxRatio =
    opts.maxRemoveRatio == null ? DEFAULT_MAX_REMOVE_RATIO : Number(opts.maxRemoveRatio);
  if (!Number.isFinite(opts.parsedCount) || opts.parsedCount <= 0) {
    return {
      ok: false,
      code: 'empty_feed',
      message: 'empty or zero-part feed; refuse delete-all',
    };
  }
  const existing = Math.max(0, Number(opts.existingActiveCount) || 0);
  const wouldRemove = Math.max(0, Number(opts.wouldRemoveCount) || 0);
  if (existing > 0) {
    const ratio = wouldRemove / existing;
    if (ratio > maxRatio) {
      return {
        ok: false,
        code: 'remove_ratio_exceeded',
        message: `would remove ${wouldRemove}/${existing} (${ratio.toFixed(2)}) > ${maxRatio}`,
      };
    }
  }
  return { ok: true };
}

module.exports = { checkSafetyGuard, DEFAULT_MAX_REMOVE_RATIO };
