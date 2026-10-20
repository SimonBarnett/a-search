'use strict';

/**
 * FR #4701: model flying / RC / hobby advertisers first, then wider UK retail.
 */

const HOBBY_RE =
  /\b(model\s*fly\w*|rc\b|radio\s*control|hobby|drone|aircraft|heli|fpv|scale\s*model)/i;

/**
 * @param {{ name?: string, category?: string, tags?: string }} candidate
 * @returns {number} lower = higher priority
 */
function priorityRank(candidate) {
  const blob = [
    candidate && candidate.name,
    candidate && candidate.category,
    candidate && candidate.tags,
  ]
    .filter(Boolean)
    .join(' ');
  if (HOBBY_RE.test(blob)) return 0;
  return 1;
}

/**
 * @param {Array<object>} candidates
 * @returns {Array<object>}
 */
function sortByPriority(candidates) {
  return [...(candidates || [])].sort((a, b) => {
    const d = priorityRank(a) - priorityRank(b);
    if (d !== 0) return d;
    return String(a.name || a.mid || '').localeCompare(
      String(b.name || b.mid || ''),
    );
  });
}

module.exports = {
  priorityRank,
  sortByPriority,
  HOBBY_RE,
};
