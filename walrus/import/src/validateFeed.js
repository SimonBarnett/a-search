'use strict';

/**
 * FR #4463: pre-MERGE validation thresholds (reject%, minRows, remove%, previous%).
 */

/**
 * @param {object} opts
 * @param {object[]} opts.staged
 * @param {object[]} opts.rejects
 * @param {number} opts.rowsRead
 * @param {object} opts.validation provider.json validation block
 * @param {number} [opts.previousGoodCount]
 * @param {number} [opts.wouldDelete]
 * @param {number} [opts.activeCount]
 */
function validateBeforeMerge(opts) {
  const v = opts.validation || {};
  const maxRejectPct = v.maxRejectPct != null ? Number(v.maxRejectPct) : 5;
  const minRows = v.minRows != null ? Number(v.minRows) : 1;
  const minRowsVsPreviousPct =
    v.minRowsVsPreviousPct != null ? Number(v.minRowsVsPreviousPct) : 50;
  const maxRemovePct = v.maxRemovePct != null ? Number(v.maxRemovePct) : 50;

  const rowsRead = Number(opts.rowsRead || 0);
  const rejectCount = (opts.rejects || []).length;
  const stagedCount = (opts.staged || []).length;

  if (stagedCount < minRows) {
    return {
      ok: false,
      code: 'threshold_breach',
      detail: `minRows:${stagedCount}<${minRows}`,
    };
  }

  if (rowsRead > 0) {
    const rejectPct = (rejectCount / rowsRead) * 100;
    if (rejectPct > maxRejectPct) {
      return {
        ok: false,
        code: 'threshold_breach',
        detail: `maxRejectPct:${rejectPct.toFixed(2)}>${maxRejectPct}`,
      };
    }
  }

  const prev = opts.previousGoodCount;
  if (prev != null && prev > 0) {
    const need = (minRowsVsPreviousPct / 100) * prev;
    if (stagedCount < need) {
      return {
        ok: false,
        code: 'threshold_breach',
        detail: `minRowsVsPreviousPct:${stagedCount}<${need}`,
      };
    }
  }

  const active = Number(opts.activeCount || 0);
  const wouldDelete = Number(opts.wouldDelete || 0);
  if (active > 0 && wouldDelete > 0) {
    const removePct = (wouldDelete / active) * 100;
    if (removePct > maxRemovePct) {
      return {
        ok: false,
        code: 'threshold_breach',
        detail: `maxRemovePct:${removePct.toFixed(2)}>${maxRemovePct}`,
      };
    }
  }

  return { ok: true };
}

module.exports = { validateBeforeMerge };
