'use strict';

/**
 * FR #4001: set-based upsert + scoped soft-delete for one affiliate feed.
 * Never touches madeiradb --- inject asearch-only DB helpers.
 */

const { mergePartsSetBased } = require('../../../maintainer/src/upsert');
const { scopedDeleteParts } = require('../../../maintainer/src/delete');
const { toPartsRowIdentity, partKeyString } = require('./partKey');
const { checkSafetyGuard } = require('./safetyGuard');

/**
 * @param {object[]} parsedParts from parseAffiliateFeed
 * @returns {object[]} Parts-shaped staging rows (Env=live)
 */
function toStagingRows(parsedParts) {
  return (parsedParts || []).map((p) => {
    const id = toPartsRowIdentity(p);
    return {
      ...id,
      Title: p.Title || '',
      Description: p.Description || '',
      Url: p.Url || '',
      ImageUrl: p.ImageUrl || '',
      Price: p.Price,
      Currency: p.Currency || 'GBP',
      Stock: p.Stock || '',
      ContentHash: p.ContentHash || `${id.MerchantProductId}:${p.Title || ''}:${p.Price || ''}`,
    };
  });
}

/**
 * In-memory transaction stand-in for unit tests.
 * @param {{
 *   parts: object[],
 *   staging: object[],
 *   provider: string,
 *   affiliateid: string,
 *   maxRemoveRatio?: number,
 *   now?: Date,
 * }} opts
 */
function importAffiliateInMemory(opts) {
  const source = String(opts.provider).toLowerCase();
  const feedKey = String(opts.affiliateid);
  const env = 'live';
  const staging = (opts.staging || []).map((r) => ({
    ...r,
    Source: source,
    FeedKey: feedKey,
    Env: env,
  }));

  const existingActive = (opts.parts || []).filter(
    (p) =>
      String(p.Source) === source &&
      String(p.FeedKey) === feedKey &&
      String(p.Env) === env &&
      !p.DeletedAt,
  );
  const stagingIds = new Set(staging.map((r) => String(r.MerchantProductId)));
  const wouldRemove = existingActive.filter(
    (p) => !stagingIds.has(String(p.MerchantProductId)),
  ).length;

  const guard = checkSafetyGuard({
    parsedCount: staging.length,
    existingActiveCount: existingActive.length,
    wouldRemoveCount: wouldRemove,
    maxRemoveRatio: opts.maxRemoveRatio,
  });
  if (!guard.ok) {
    const err = new Error(guard.message);
    err.code = guard.code;
    throw err;
  }

  const merged = mergePartsSetBased({
    staging,
    parts: opts.parts || [],
  });
  const deleted = scopedDeleteParts({
    parts: merged.parts,
    staging,
    source,
    feedKey,
    env,
    now: opts.now,
  });

  const removedKeys = existingActive
    .filter((p) => !stagingIds.has(String(p.MerchantProductId)))
    .map((p) =>
      partKeyString({
        provider: p.Source,
        affiliateid: p.FeedKey,
        partid: p.MerchantProductId,
      }),
    );

  return {
    parts: deleted.parts,
    inserted: merged.inserted,
    updated: merged.updated,
    removed: deleted.deleted,
    removedKeys,
  };
}

module.exports = {
  toStagingRows,
  importAffiliateInMemory,
};
