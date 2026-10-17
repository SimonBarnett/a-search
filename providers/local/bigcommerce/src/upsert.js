'use strict';

const {
  mergePartsSetBased,
  upsertParts: maintainerUpsertParts,
  naturalKey,
  MERGE_SQL,
} = require('../../../../maintainer/src/upsert');
const {
  normalizeBigCommerceCatalog,
  assertPartsRow,
} = require('./normalize');

async function upsertBigCommerceParts(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('upsertBigCommerceParts: opts required');
  }
  const feedKey = String(opts.feedKey || '').trim();
  const env = String(opts.env || '').trim();
  if (!feedKey) throw new Error('upsertBigCommerceParts: feedKey required');
  if (env !== 'live' && env !== 'sandbox') {
    throw new Error(
      `upsertBigCommerceParts: env must be live|sandbox, got ${JSON.stringify(env)}`,
    );
  }
  const source = String(opts.source || 'bigcommerce').trim() || 'bigcommerce';
  let rows = Array.isArray(opts.rows) ? opts.rows.slice() : null;
  if (!rows) {
    rows = normalizeBigCommerceCatalog(opts.body, {
      source,
      feedKey,
      env,
      shopDomain: opts.shopDomain,
      currency: opts.currency,
    });
  }
  for (const r of rows) assertPartsRow(r);
  if (typeof opts.executeMerge === 'function') {
    return opts.executeMerge({ rows, source, feedKey, env });
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
  upsertBigCommerceParts,
  mergePartsSetBased,
  maintainerUpsertParts,
  naturalKey,
  MERGE_SQL,
};
