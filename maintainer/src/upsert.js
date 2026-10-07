'use strict';

/**
 * Staging bulk load + set-based MERGE upsert for Parts (FR-014).
 * Hot path must not per-row INSERT loop.
 */

const path = require('node:path');
const fs = require('node:fs');

function naturalKey(row) {
  return [
    String(row.Source),
    String(row.FeedKey),
    String(row.MerchantProductId),
    String(row.Env),
  ].join('\0');
}

/**
 * In-memory set-based merge (fixture / unit stand-in for SQL MERGE).
 * Computes the full change set, then applies once via applyBatch.
 *
 * @param {{
 *   staging: object[],
 *   parts: object[],
 *   applyBatch?: (batch: object[]) => { inserted?: number, updated?: number },
 * }} opts
 */
function mergePartsSetBased(opts) {
  const staging = opts.staging || [];
  const existing = new Map((opts.parts || []).map((p) => [naturalKey(p), { ...p }]));
  const batch = [];

  for (const row of staging) {
    const k = naturalKey(row);
    const prev = existing.get(k);
    if (!prev) {
      batch.push({ ...row, _op: 'insert' });
      continue;
    }
    if (String(prev.ContentHash || '') !== String(row.ContentHash || '')) {
      batch.push({ ...row, _op: 'update' });
    }
  }

  const apply =
    opts.applyBatch ||
    ((b) => {
      for (const row of b) {
        const { _op, ...rest } = row;
        void _op;
        existing.set(naturalKey(rest), rest);
      }
      return {
        inserted: b.filter((r) => r._op === 'insert').length,
        updated: b.filter((r) => r._op === 'update').length,
      };
    });

  const stats = apply(batch) || {};
  // Ensure parts map reflects batch when custom applyBatch only counts
  if (opts.applyBatch) {
    for (const row of batch) {
      const { _op, ...rest } = row;
      void _op;
      existing.set(naturalKey(rest), rest);
    }
  }

  const inserted = stats.inserted != null
    ? stats.inserted
    : batch.filter((r) => r._op === 'insert').length;
  const updated = stats.updated != null
    ? stats.updated
    : batch.filter((r) => r._op === 'update').length;

  return {
    parts: [...existing.values()],
    changed: inserted + updated,
    inserted,
    updated,
    batchSize: batch.length,
  };
}

/**
 * Deploy path: clear staging → bulk load → set-based MERGE (injected).
 */
async function upsertParts(opts) {
  const rows = (opts.rows || []).map((r) => ({
    ...r,
    Source: opts.source,
    FeedKey: opts.feedKey,
    Env: opts.env,
  }));
  if (opts.clearStaging) {
    await opts.clearStaging({
      source: opts.source,
      feedKey: opts.feedKey,
      env: opts.env,
    });
  }
  if (opts.bulkLoadStaging) await opts.bulkLoadStaging(rows);
  if (!opts.runMerge) {
    throw new Error('runMerge not configured — inject set-based MERGE for deploy');
  }
  return opts.runMerge({
    source: opts.source,
    feedKey: opts.feedKey,
    env: opts.env,
    rowCount: rows.length,
  });
}

const MERGE_SQL = `
-- Set-based MERGE PartsStaging → Parts for one feed key + env (FR-014)
MERGE dbo.Parts AS T
USING (
  SELECT *
  FROM dbo.PartsStaging
  WHERE Source = @Source
    AND FeedKey = @FeedKey
    AND Env = @Env
) AS S
ON T.Source = S.Source
 AND T.FeedKey = S.FeedKey
 AND T.MerchantProductId = S.MerchantProductId
 AND T.Env = S.Env
WHEN MATCHED AND (
  ISNULL(T.ContentHash, N'') <> ISNULL(S.ContentHash, N'')
)
THEN UPDATE SET
  Title = S.Title,
  Description = S.Description,
  Url = S.Url,
  ImageUrl = S.ImageUrl,
  Price = S.Price,
  Currency = S.Currency,
  Stock = S.Stock,
  ContentHash = S.ContentHash,
  DeletedAt = NULL,
  UpdatedAt = SYSUTCDATETIME()
WHEN NOT MATCHED BY TARGET
THEN INSERT (
  Source, FeedKey, MerchantProductId, Env,
  Title, Description, Url, ImageUrl, Price, Currency, Stock, ContentHash
) VALUES (
  S.Source, S.FeedKey, S.MerchantProductId, S.Env,
  S.Title, S.Description, S.Url, S.ImageUrl, S.Price, S.Currency, S.Stock, S.ContentHash
);
`.trim();

function loadMergeSqlFile() {
  const p = path.join(__dirname, '..', 'sql', '004_MergeParts.sql');
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  return MERGE_SQL;
}

module.exports = {
  mergePartsSetBased,
  upsertParts,
  naturalKey,
  MERGE_SQL,
  loadMergeSqlFile,
};
