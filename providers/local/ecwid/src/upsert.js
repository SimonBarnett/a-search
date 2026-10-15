'use strict';

const {
  mergePartsSetBased,
  upsertParts: maintainerUpsertParts,
  naturalKey,
  MERGE_SQL,
} = require('../../../../maintainer/src/upsert');
const {
  normalizeEcwidCatalog,
  assertPartsRow,
} = require('./normalize');

async function upsertEcwidParts(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('upsertEcwidParts: opts required');
  }
  const feedKey = String(opts.feedKey || '').trim();
  const env = String(opts.env || '').trim();
  if (!feedKey) throw new Error('upsertEcwidParts: feedKey required');
  if (env !== 'live' && env !== 'sandbox') {
    throw new Error(
      `upsertEcwidParts: env must be live|sandbox, got ${JSON.stringify(env)}`,
    );
  }
  const source = String(opts.source || 'ecwid').trim() || 'ecwid';
  let rows = Array.isArray(opts.rows) ? opts.rows.slice() : null;
  if (!rows) {
    rows = normalizeEcwidCatalog(opts.body, {
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
  upsertEcwidParts,
  mergePartsSetBased,
  maintainerUpsertParts,
  naturalKey,
  MERGE_SQL,
};
