'use strict';

/**
 * Maintainer roll: select TOP N due PartFeedKeys for A_SEARCH_ENV (FR-012).
 * Due = NextCheck IS NULL OR NextCheck <= now. Oldest first. Env-scoped.
 */

/**
 * @param {object[]} rows - PartFeedKeys-like rows
 * @param {{ env: string, top: number, now?: Date }} opts
 * @returns {object[]}
 */
function selectDueKeys(rows, opts) {
  const env = opts.env;
  const top = Math.max(0, Number(opts.top) || 0);
  const now = opts.now instanceof Date ? opts.now : new Date();
  const nowMs = now.getTime();

  const due = (rows || []).filter((r) => {
    if (!r || String(r.Env) !== String(env)) return false;
    if (r.NextCheck == null || r.NextCheck === '') return true;
    const t = r.NextCheck instanceof Date ? r.NextCheck : new Date(r.NextCheck);
    if (Number.isNaN(t.getTime())) return true;
    return t.getTime() <= nowMs;
  });

  due.sort((a, b) => {
    const am =
      a.NextCheck == null || a.NextCheck === ''
        ? Number.NEGATIVE_INFINITY
        : (a.NextCheck instanceof Date
            ? a.NextCheck
            : new Date(a.NextCheck)
          ).getTime();
    const bm =
      b.NextCheck == null || b.NextCheck === ''
        ? Number.NEGATIVE_INFINITY
        : (b.NextCheck instanceof Date
            ? b.NextCheck
            : new Date(b.NextCheck)
          ).getTime();
    if (am !== bm) return am - bm;
    return String(a.FeedKey).localeCompare(String(b.FeedKey));
  });

  return due.slice(0, top);
}

/**
 * @param {{
 *   queryPartFeedKeys?: () => Promise<object[]>,
 *   envVars?: Record<string, string|undefined>,
 *   now?: Date,
 * }} [opts]
 */
async function roll(opts = {}) {
  const envVars = opts.envVars || process.env;
  const env = (envVars.A_SEARCH_ENV || 'sandbox').trim();
  if (env !== 'live' && env !== 'sandbox') {
    throw new Error(`A_SEARCH_ENV must be live|sandbox, got ${JSON.stringify(env)}`);
  }
  const top = Math.max(1, parseInt(envVars.MAINTAINER_TOP || '10', 10) || 10);
  const query =
    opts.queryPartFeedKeys ||
    (async () => {
      throw new Error(
        'queryPartFeedKeys not configured — inject MSSQL reader for deploy',
      );
    });
  const rows = await query({ env });
  const keys = selectDueKeys(rows, { env, top, now: opts.now });
  return { env, top, keys };
}

/** SQL shape reference for deploy (not executed here). */
const ROLL_SQL = `
SELECT TOP (@top)
  Source, FeedKey, Env, FeedUrl, ETag, LastModified, ContentHash,
  LastChecked, NextCheck, LastError
FROM dbo.PartFeedKeys
WHERE Env = @env
  AND (NextCheck IS NULL OR NextCheck <= SYSUTCDATETIME())
ORDER BY
  CASE WHEN NextCheck IS NULL THEN 0 ELSE 1 END,
  NextCheck ASC,
  FeedKey ASC;
`.trim();

module.exports = { selectDueKeys, roll, ROLL_SQL };
