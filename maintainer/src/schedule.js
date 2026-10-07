'use strict';

/**
 * Maintainer schedule entry (FR-031).
 * EventBridge → roll due PartFeedKeys → conditional fetch → upsert → scoped delete.
 */

const { roll: defaultRoll } = require('./roll');
const { fetchFeed: defaultFetchFeed } = require('./fetch');
const { upsertParts: defaultUpsertParts } = require('./upsert');
const { deleteMissingParts: defaultDeleteMissing } = require('./delete');

/**
 * Default body → staging rows (JSON array or NDJSON). Deploy injects CSV parsers.
 * @param {Buffer|string} body
 * @param {{ source: string, feedKey: string, env: string, contentHash?: string }} meta
 */
function defaultParseFeedRows(body, meta) {
  const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body || '');
  const trimmed = text.trim();
  if (!trimmed) return [];
  let items;
  if (trimmed.startsWith('[')) {
    items = JSON.parse(trimmed);
  } else {
    items = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
  if (!Array.isArray(items)) {
    throw new Error('parseFeedRows: expected JSON array or NDJSON');
  }
  return items.map((row) => ({
    ...row,
    Source: meta.source,
    FeedKey: meta.feedKey,
    Env: meta.env,
    ContentHash: row.ContentHash || meta.contentHash || null,
  }));
}

/**
 * @param {object} _event - EventBridge scheduled event
 * @param {object} [_context]
 * @param {object} [deps] - injectable SQL/HTTP/parse/upsert deps for offline tests
 */
async function handler(_event, _context, deps = {}) {
  const envVars = deps.envVars || process.env;
  const env = (envVars.A_SEARCH_ENV || 'sandbox').trim();
  if (env !== 'live' && env !== 'sandbox') {
    throw new Error(`A_SEARCH_ENV must be live|sandbox, got ${JSON.stringify(env)}`);
  }

  const rollFn = deps.roll || defaultRoll;
  const fetchFn = deps.fetchFeed || defaultFetchFeed;
  const upsertFn = deps.upsertParts || defaultUpsertParts;
  const deleteFn = deps.deleteMissingParts || defaultDeleteMissing;
  const parseRows = deps.parseFeedRows || defaultParseFeedRows;

  const rolled = await rollFn({
    queryPartFeedKeys: deps.queryPartFeedKeys,
    envVars,
    now: deps.now,
  });

  const results = [];
  let processed = 0;
  let upserted = 0;
  let skipped = 0;

  for (const feed of rolled.keys || []) {
    const fetchResult = await fetchFn({
      feed,
      httpGet: deps.httpGet,
      bumpLastChecked: deps.bumpLastChecked,
    });

    processed += 1;

    if (!fetchResult.shouldUpsert) {
      skipped += 1;
      results.push({
        feedKey: feed.FeedKey,
        source: feed.Source,
        action: fetchResult.action,
        upserted: false,
      });
      continue;
    }

    const rows = parseRows(fetchResult.body, {
      source: feed.Source,
      feedKey: feed.FeedKey,
      env: feed.Env || env,
      contentHash: fetchResult.contentHash,
    });

    await upsertFn({
      rows,
      source: feed.Source,
      feedKey: feed.FeedKey,
      env: feed.Env || env,
      clearStaging: deps.clearStaging,
      bulkLoadStaging: deps.bulkLoadStaging,
      runMerge: deps.runMerge,
    });

    await deleteFn({
      source: feed.Source,
      feedKey: feed.FeedKey,
      env: feed.Env || env,
      runScopedDelete: deps.runScopedDelete,
    });

    upserted += 1;
    results.push({
      feedKey: feed.FeedKey,
      source: feed.Source,
      action: fetchResult.action,
      upserted: true,
      rowCount: rows.length,
    });
  }

  return {
    ok: true,
    env,
    processed,
    upserted,
    skipped,
    top: rolled.top,
    results,
    message: `maintainer schedule: rolled ${processed} key(s), upserted ${upserted}, skipped ${skipped}`,
  };
}

module.exports = { handler, defaultParseFeedRows };
