'use strict';

const {
  mergePartsSetBased,
  upsertParts: maintainerUpsertParts,
  naturalKey,
  MERGE_SQL,
} = require('../../../../maintainer/src/upsert');
const {
  normalizeMagentoCatalog,
  assertPartsRow,
} = require('./normalize');

async function upsertMagentoParts(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('upsertMagentoParts: opts required');
  }
  const feedKey = String(opts.feedKey || '').trim();
  const env = String(opts.env || '').trim();
  if (!feedKey) throw new Error('upsertMagentoParts: feedKey required');
  if (env !== 'live' && env !== 'sandbox') {
    throw new Error(
      `upsertMagentoParts: env must be live|sandbox, got ${JSON.stringify(env)}`,
    );
  }
  const source = String(opts.source || 'magento').trim() || 'magento';
  let rows = Array.isArray(opts.rows) ? opts.rows.slice() : null;
  if (!rows) {
    rows = normalizeMagentoCatalog(opts.body, {
      source,
      feedKey,
      env,
      storeBaseUrl: opts.storeBaseUrl,
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
  upsertMagentoParts,
  mergePartsSetBased,
  maintainerUpsertParts,
  naturalKey,
  MERGE_SQL,
};
