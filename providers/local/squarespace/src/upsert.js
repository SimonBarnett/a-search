'use strict';

/**
 * Squarespace -> Parts upsert (FR-242). Wraps maintainer set-based MERGE.
 */

const {
  mergePartsSetBased,
  upsertParts: maintainerUpsertParts,
  naturalKey,
  MERGE_SQL,
} = require('../../../../maintainer/src/upsert');
const {
  normalizeSquarespaceCatalog,
  assertPartsRow,
} = require('./normalize');

/**
 * @param {object} opts
 * @returns {Promise<object>}
 */
async function upsertSquarespaceParts(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('upsertSquarespaceParts: opts required');
  }
  const feedKey = String(opts.feedKey || '').trim();
  const env = String(opts.env || '').trim();
  if (!feedKey) throw new Error('upsertSquarespaceParts: feedKey required');
  if (env !== 'live' && env !== 'sandbox') {
    throw new Error(
      `upsertSquarespaceParts: env must be live|sandbox, got ${JSON.stringify(env)}`,
    );
  }
  const source = String(opts.source || 'squarespace').trim() || 'squarespace';

  let rows = Array.isArray(opts.rows) ? opts.rows.slice() : null;
  if (!rows) {
    rows = normalizeSquarespaceCatalog(opts.body, {
      source,
      feedKey,
      env,
      siteDomain: opts.siteDomain,
    });
  }
  for (const r of rows) assertPartsRow(r);

  if (typeof opts.executeMerge === 'function') {
    return opts.executeMerge({ rows, source, feedKey, env });
  }
  if (typeof opts.upsert === 'function') {
    return opts.upsert({ rows, source, feedKey, env });
  }
  return mergePartsSetBased({
    rows,
    source,
    feedKey,
    env,
    execute: opts.execute,
  });
}

module.exports = {
  upsertSquarespaceParts,
  mergePartsSetBased,
  maintainerUpsertParts,
  naturalKey,
  MERGE_SQL,
};
