'use strict';

/**
 * WooCommerce -> Parts upsert contract (FR-110).
 * Wraps maintainer set-based MERGE helpers; SQL is injectable for offline unit tests.
 * Stay-dark: does not flip registry enabled.
 */

const {
  mergePartsSetBased,
  upsertParts: maintainerUpsertParts,
  naturalKey,
  MERGE_SQL,
} = require('../../../../maintainer/src/upsert');
const {
  normalizeWooCommerceCatalog,
  assertPartsRow,
} = require('./normalize');

/**
 * Normalize REST payload then upsert via injected staging/MERGE hooks.
 *
 * @param {object} opts
 * @param {object|Array} [opts.body] WooCommerce products payload (or array)
 * @param {Array<object>} [opts.rows] Pre-normalized Parts rows (skips body)
 * @param {string} [opts.source]
 * @param {string} opts.feedKey
 * @param {string} opts.env live|sandbox
 * @param {string|null} [opts.contentHash]
 * @param {(args: object) => Promise<void>} [opts.clearStaging]
 * @param {(rows: object[]) => Promise<void>} [opts.bulkLoadStaging]
 * @param {(args: object) => Promise<object>} [opts.runMerge]
 * @param {object[]} [opts.existingParts] for in-memory mergePartsSetBased path
 * @param {(batch: object[]) => object} [opts.applyBatch]
 * @returns {Promise<object>}
 */
async function upsertWooCommerceParts(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('upsertWooCommerceParts: opts required');
  }
  const feedKey = String(opts.feedKey || '').trim();
  const env = String(opts.env || '').trim();
  if (!feedKey) throw new Error('upsertWooCommerceParts: feedKey required');
  if (env !== 'live' && env !== 'sandbox') {
    throw new Error(
      `upsertWooCommerceParts: env must be live|sandbox, got ${JSON.stringify(env)}`,
    );
  }
  const source =
    String(opts.source || 'woocommerce').trim() || 'woocommerce';

  let rows = Array.isArray(opts.rows) ? opts.rows.slice() : null;
  if (!rows) {
    rows = normalizeWooCommerceCatalog(opts.body, {
      source,
      feedKey,
      env,
      contentHash: opts.contentHash,
    });
  }

  for (const row of rows) {
    assertPartsRow(row);
  }

  // Deploy path: injectable clear -> bulkLoad -> runMerge (maintainer upsertParts).
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
            'upsertWooCommerceParts: runMerge not configured - inject set-based MERGE for deploy',
          );
        }),
    });
  }

  // Offline / unit path: in-memory set-based merge (no live SQL).
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
 * Maintainer-facing hook: only Source=woocommerce.
 * Deploy may wire `deps.upsertParts = woocommerceUpsertPartsHook` for woo feed keys.
 *
 * @param {object} opts same as upsertWooCommerceParts (+ source gate)
 */
async function woocommerceUpsertPartsHook(opts) {
  const source =
    opts && opts.source != null ? String(opts.source) : 'woocommerce';
  if (source && source !== 'woocommerce') {
    throw new Error(
      `woocommerceUpsertPartsHook: wrong source ${JSON.stringify(source)}`,
    );
  }
  return upsertWooCommerceParts({ ...opts, source: 'woocommerce' });
}

module.exports = {
  upsertWooCommerceParts,
  woocommerceUpsertPartsHook,
  mergePartsSetBased,
  naturalKey,
  MERGE_SQL,
};
