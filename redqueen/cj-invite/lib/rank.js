'use strict';

/**
 * FR #5066: rank CJ Advertiser Lookup rows for invite.
 * Prefer hobby / RC categories, then network-rank, then 3-month EPC.
 */

const HOBBY_RE =
  /hobby|hobbies|toys|rc\b|radio.?control|model.?aircraft|drone|outdoor|sport|leisure|garden/i;

/**
 * @param {object} row
 * @returns {number}
 */
export function scoreCjAdvertiser(row) {
  const cat = String(row.primaryCategory || row.sector || '');
  const hobbyBoost = HOBBY_RE.test(cat) ? 5000 : 0;
  const rank =
    row.networkRank != null && Number.isFinite(Number(row.networkRank))
      ? Number(row.networkRank)
      : 0;
  const epc =
    row.epc3Month != null && Number.isFinite(Number(row.epc3Month))
      ? Number(row.epc3Month)
      : row.epc7Day != null && Number.isFinite(Number(row.epc7Day))
        ? Number(row.epc7Day)
        : 0;
  const feedBoost = row.hasFeed ? 200 : 0;
  return hobbyBoost + feedBoost + rank * 10 + epc;
}

/**
 * @param {object[]} rows
 * @returns {object[]}
 */
export function rankCjAdvertisers(rows) {
  return [...(rows || [])].sort((a, b) => {
    const ds = scoreCjAdvertiser(b) - scoreCjAdvertiser(a);
    if (ds !== 0) return ds;
    return String(a.id).localeCompare(String(b.id), 'en', { numeric: true });
  });
}
