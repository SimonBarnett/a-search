'use strict';

/**
 * Shopify → Parts upsert contract (FR-102).
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
  normalizeShopifyCatalog,
  assertPartsRow,
} = require('./normalize');

/**
 * Normalize Admin payload then upsert via injected staging/MERGE hooks.
 *
 * @param {object} opts
 * @param {object|Array} [opts.body] Admin products.json (or array)
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
async function upsertShopifyParts(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('upsertShopifyParts: opts required');
  }
  const feedKey = String(opts.feedKey || '').trim();
  const env = String(opts.env || '').trim();
  if (!feedKey) throw new Error('upsertShopifyParts: feedKey required');
  if (env !== 'live' && env !== 'sandbox') {
    throw new Error(
      `upsertShopifyParts: env must be live|sandbox, got ${JSON.stringify(env)}`,
    );
  }
  const source = String(opts.source || 'shopify').trim() || 'shopify';

  let rows = Array.isArray(opts.rows) ? opts.rows.slice() : null;
  if (!rows) {
    rows = normalizeShopifyCatalog(opts.body, {
      source,
      feedKey,
      env,
      contentHash: opts.contentHash,
    });
  }

  for (const row of rows) {
    assertPartsRow(row);
  }

  // Deploy path: injectable clear → bulkLoad → runMerge (maintainer upsertParts).
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
            'upsertShopifyParts: runMerge not configured — inject set-based MERGE for deploy',
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
 * Maintainer-facing hook: only Source=shopify.
 * Deploy may wire `deps.upsertParts = shopifyUpsertPartsHook` for shopify feed keys.
 *
 * @param {object} opts same as upsertShopifyParts (+ source gate)
 */
async function shopifyUpsertPartsHook(opts) {
  const source = opts && opts.source != null ? String(opts.source) : 'shopify';
  if (source && source !== 'shopify') {
    throw new Error(
      `shopifyUpsertPartsHook: wrong source ${JSON.stringify(source)}`,
    );
  }
  return upsertShopifyParts({ ...opts, source: 'shopify' });
}

module.exports = {
  upsertShopifyParts,
  shopifyUpsertPartsHook,
  mergePartsSetBased,
  naturalKey,
  MERGE_SQL,
};
