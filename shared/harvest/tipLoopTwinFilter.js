'use strict';

/**
 * Tip-loop twin filter for Invoke-BobiverseHarvest -ExistingPrUrl wrap-up (FR-1947 / FR-2314 / FR-2315).
 * Agents and scripts must use these predicates; never bare pull/N substring match.
 */

/**
 * @param {{ title?: string, labels?: Array<string|{name?: string}> }} pr
 * @returns {boolean}
 */
function isHarvestLessonPr(pr) {
  if (!pr || typeof pr !== 'object') return false;
  const title = String(pr.title || '').trim();
  if (/^lesson\s*\(/i.test(title)) return true;
  const labels = Array.isArray(pr.labels) ? pr.labels : [];
  return labels.some((l) => {
    const n = typeof l === 'string' ? l : l && l.name;
    return String(n || '').toLowerCase() === 'harvest-lesson';
  });
}

/**
 * Exact Existing PR line only (never bare pull/N).
 * @param {string|undefined|null} body
 * @param {string} existingPrUrl
 * @returns {boolean}
 */
function bodyHasExactExistingPr(body, existingPrUrl) {
  const url = String(existingPrUrl || '').trim();
  if (!url) return false;
  return String(body || '').includes(`Existing PR: ${url}`);
}

/**
 * @param {{
 *   candidate: { number?: number, title?: string, body?: string, labels?: unknown[] },
 *   existingPrUrl: string,
 *   thisLessonTitlePrefix: string,
 *   existingPrMeta: { number?: number, title?: string, labels?: unknown[] },
 * }} args
 * @returns {boolean}
 */
function isTipLoopTwin(args) {
  const candidate = args && args.candidate;
  const existingPrUrl = args && args.existingPrUrl;
  const thisLessonTitlePrefix = args && args.thisLessonTitlePrefix;
  const existingPrMeta = args && args.existingPrMeta;
  if (!candidate || typeof candidate !== 'object') return false;
  if (
    existingPrMeta &&
    existingPrMeta.number != null &&
    candidate.number != null &&
    Number(candidate.number) === Number(existingPrMeta.number)
  ) {
    return false;
  }
  const title = String(candidate.title || '');
  const prefix = String(thisLessonTitlePrefix || '');
  if (prefix && title.startsWith(prefix)) return true;
  // Body ExistingPrUrl match only when the ExistingPrUrl TARGET is a harvest-lesson tip.
  // Product FR ExistingPrUrl must not close the substance harvest tip that documents it (FR-2315).
  if (!isHarvestLessonPr(existingPrMeta || {})) return false;
  return bodyHasExactExistingPr(candidate.body, existingPrUrl);
}

module.exports = {
  isHarvestLessonPr,
  bodyHasExactExistingPr,
  isTipLoopTwin,
};
