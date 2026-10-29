'use strict';

/**
 * Wix → Parts upsert contract (FR-106).
 * Wraps maintainer set-based MERGE helpers; SQL is injectable for offline unit tests.
 * Stay-dark: does not flip registry enabled.
 */

const {
  mergePartsSetBased,
  upsertParts: maintainerUpsertParts,
  naturalKey,
  MERGE_SQL,
} = require('../../../../maintainer/src/upsert');
const { normalizeWixCatalog, assertPartsRow } = require('./normalize');

/**
 * @param {object} opts
 * @returns {Promise<object>}
 */
async function upsertWixParts(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('upsertWixParts: opts required');
  }
  const feedKey = String(opts.feedKey || '').trim();
  const env = String(opts.env || '').trim();
  if (!feedKey) throw new Error('upsertWixParts: feedKey required');
  if (env !== 'live' && env !== 'sandbox') {
    throw new Error(
      `upsertWixParts: env must be live|sandbox, got ${JSON.stringify(env)}`,
    );
  }
  const source = String(opts.source || 'wix').trim() || 'wix';

  let rows = Array.isArray(opts.rows) ? opts.rows.slice() : null;
  if (!rows) {
    rows = normalizeWixCatalog(opts.body, {
      source,
      feedKey,
      env,
      contentHash: opts.contentHash,
    });
  }

  for (const row of rows) {
    assertPartsRow(row);
  }

  if (
    typeof opts.runMerge === 'function' ||
    typeof opts.bulkLoadStaging === 'function' ||
    typeof opts.clearStaging === 'function'
  ) {
    return maintainerUpsertParts({
      source,
      feedKey,
      env,
      rows,
      clearStaging: opts.clearStaging,
      bulkLoadStaging: opts.bulkLoadStaging,
      runMerge:
        opts.runMerge ||
        (async () => {
          throw new Error(
            'upsertWixParts: runMerge not configured — inject set-based MERGE for deploy',
          );
        }),
    });
  }

  return mergePartsSetBased({
    staging: rows.map((r) => ({
      ...r,
      Source: source,
      FeedKey: feedKey,
      Env: env,
    })),
    parts: opts.existingParts || [],
    applyBatch: opts.applyBatch,
  });
}

/**
 * Maintainer-facing hook: only Source=wix.
 * @param {object} opts
 */
async function wixUpsertPartsHook(opts) {
  const source = opts && opts.source != null ? String(opts.source) : 'wix';
  if (source && source !== 'wix') {
    throw new Error(`wixUpsertPartsHook: wrong source ${JSON.stringify(source)}`);
  }
  return upsertWixParts({ ...opts, source: 'wix' });
}

module.exports = {
  upsertWixParts,
  wixUpsertPartsHook,
  mergePartsSetBased,
  naturalKey,
  MERGE_SQL,
};
