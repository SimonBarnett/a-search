'use strict';

/**
 * FR #4701: never re-apply within 90 days; never re-apply Pending or Approved.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const NO_REAPPLY_DAYS = 90;

/**
 * @param {{ status?: string, appliedat?: string, firstappliedat?: string }} record
 * @param {Date|number} [now]
 * @returns {{ eligible: boolean, reason?: string }}
 */
function canReapply(record, now = new Date()) {
  const status = String((record && record.status) || '')
    .trim()
    .toLowerCase();
  if (status === 'pending' || status === 'approved') {
    return { eligible: false, reason: status };
  }
  const applied =
    String((record && (record.appliedat || record.firstappliedat)) || '').trim();
  if (!applied) return { eligible: true };
  const ts = Date.parse(applied);
  if (Number.isNaN(ts)) return { eligible: true };
  const ageMs = Number(now) - ts;
  if (ageMs < NO_REAPPLY_DAYS * DAY_MS) {
    return { eligible: false, reason: 'within_90_days' };
  }
  return { eligible: true };
}

module.exports = {
  canReapply,
  NO_REAPPLY_DAYS,
};
