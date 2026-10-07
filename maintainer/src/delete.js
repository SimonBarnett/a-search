'use strict';

/**
 * Scoped delete/soft-delete Parts missing from a successful feed refresh (FR-015).
 * Scope: Source + FeedKey + Env only. Never truncate whole Parts.
 */

/**
 * @param {{
 *   parts: object[],
 *   staging: object[],
 *   source: string,
 *   feedKey: string,
 *   env: string,
 *   now?: Date,
 * }} opts
 */
function scopedDeleteParts(opts) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const stagingIds = new Set(
    (opts.staging || [])
      .filter(
        (r) =>
          String(r.Source) === String(opts.source) &&
          String(r.FeedKey) === String(opts.feedKey) &&
          String(r.Env) === String(opts.env),
      )
      .map((r) => String(r.MerchantProductId)),
  );

  let deleted = 0;
  const parts = (opts.parts || []).map((p) => {
    const inScope =
      String(p.Source) === String(opts.source) &&
      String(p.FeedKey) === String(opts.feedKey) &&
      String(p.Env) === String(opts.env);
    if (!inScope) return { ...p };
    if (p.DeletedAt) return { ...p };
    if (stagingIds.has(String(p.MerchantProductId))) return { ...p };
    deleted += 1;
    return { ...p, DeletedAt: now.toISOString() };
  });

  return { parts, deleted };
}

/**
 * Deploy path: inject runScopedDelete executing DELETE_SQL / soft-delete UPDATE.
 */
async function deleteMissingParts(opts) {
  if (!opts.runScopedDelete) {
    throw new Error(
      'runScopedDelete not configured — inject scoped SQL delete for deploy',
    );
  }
  return opts.runScopedDelete({
    source: opts.source,
    feedKey: opts.feedKey,
    env: opts.env,
  });
}

const DELETE_SQL = `
-- FR-015: soft-delete Parts for one Source/FeedKey/Env missing from PartsStaging
-- Do not clear the whole Parts table.
UPDATE T
SET DeletedAt = SYSUTCDATETIME(),
    UpdatedAt = SYSUTCDATETIME()
FROM dbo.Parts AS T
WHERE T.Source = @Source
  AND T.FeedKey = @FeedKey
  AND T.Env = @Env
  AND T.DeletedAt IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM dbo.PartsStaging AS S
    WHERE S.Source = T.Source
      AND S.FeedKey = T.FeedKey
      AND S.Env = T.Env
      AND S.MerchantProductId = T.MerchantProductId
  );
`.trim();

module.exports = {
  scopedDeleteParts,
  deleteMissingParts,
  DELETE_SQL,
};
