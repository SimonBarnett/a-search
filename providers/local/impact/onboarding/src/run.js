'use strict';

/**
 * Impact onboarding runOnce (FR-049d stub + FR-051b pending-queue drain).
 *
 * Impact catalogue-join API is UNKNOWN — drain MSSQL (or injectable)
 * pending-onboard rows until remaining=0. See
 * docs/impact-pending-onboard-queue.md.
 *
 * Signup persist is out of scope (FR-051c); signups stays [].
 */

/**
 * @param {object} [deps]
 * @returns {string} live|sandbox
 */
function resolveEnvName(deps = {}) {
  if (deps.env === 'live' || deps.env === 'sandbox') return deps.env;
  const envVars = deps.envVars || deps.env || process.env;
  const v = String((envVars && envVars.A_SEARCH_ENV) || 'sandbox').trim();
  return v === 'live' ? 'live' : 'sandbox';
}

/**
 * In-memory pending queue for tests / offline drain.
 * Rows mutate Status to done when marked.
 *
 * @param {object[]} [initial]
 * @returns {{
 *   rows: object[],
 *   listPending: Function,
 *   markProcessed: Function,
 *   countRemaining: Function,
 * }}
 */
function createMemoryPendingQueue(initial = []) {
  const rows = (Array.isArray(initial) ? initial : []).map((r, i) => ({
    Id: r.Id != null ? r.Id : i + 1,
    Env: r.Env || r.env || 'sandbox',
    MerchantId: String(r.MerchantId || r.merchantId || ''),
    MerchantName: r.MerchantName || r.merchantName || null,
    Status: r.Status || r.status || 'pending',
    EnqueuedAt: r.EnqueuedAt || new Date().toISOString(),
    ProcessedAt: r.ProcessedAt || null,
    LastError: r.LastError || null,
  }));

  async function listPending({ env, limit = 10 } = {}) {
    const lim = Number(limit) > 0 ? Number(limit) : 10;
    return rows
      .filter((r) => r.Env === env && r.Status === 'pending')
      .slice(0, lim)
      .map((r) => ({ ...r }));
  }

  async function markProcessed({ id, status = 'done', error = null } = {}) {
    const row = rows.find((r) => String(r.Id) === String(id));
    if (!row) return false;
    row.Status = status;
    row.ProcessedAt = new Date().toISOString();
    if (error) row.LastError = String(error);
    return true;
  }

  async function countRemaining({ env } = {}) {
    return rows.filter(
      (r) =>
        r.Env === env &&
        (r.Status === 'pending' || r.Status === 'processing'),
    ).length;
  }

  return { rows, listPending, markProcessed, countRemaining };
}

/**
 * Bind injectable queue ops. Prefer explicit listPending/markProcessed/
 * countRemaining; else deps.pendingRows (mutable) via memory helper;
 * else empty in-memory queue (safe no-op drain).
 *
 * @param {object} deps
 */
function bindQueue(deps = {}) {
  if (
    typeof deps.listPending === 'function' &&
    typeof deps.markProcessed === 'function' &&
    typeof deps.countRemaining === 'function'
  ) {
    return {
      listPending: deps.listPending,
      markProcessed: deps.markProcessed,
      countRemaining: deps.countRemaining,
    };
  }
  if (Array.isArray(deps.pendingRows)) {
    const mem = createMemoryPendingQueue(deps.pendingRows);
    // Keep caller array in sync for tests that hold the same reference.
    deps.pendingRows.length = 0;
    for (const r of mem.rows) deps.pendingRows.push(r);
    return mem;
  }
  return createMemoryPendingQueue([]);
}

/**
 * @param {object} [deps]
 * @param {object} [deps.envVars]
 * @param {string} [deps.env]
 * @param {number} [deps.batchSize]
 * @param {Function} [deps.listPending]
 * @param {Function} [deps.markProcessed]
 * @param {Function} [deps.countRemaining]
 * @param {object[]} [deps.pendingRows]
 * @returns {Promise<{ processed: number, remaining: number, signups: object[] }>}
 */
async function runOnce(deps = {}) {
  const env = resolveEnvName(deps);
  const batchSize =
    deps.batchSize != null && Number(deps.batchSize) > 0
      ? Number(deps.batchSize)
      : 10;
  const queue = bindQueue(deps);

  const batch = await queue.listPending({ env, limit: batchSize, deps });
  let processed = 0;

  for (const row of batch) {
    const id = row.Id != null ? row.Id : row.id;
    try {
      if (typeof deps.onProcessRow === 'function') {
        await deps.onProcessRow(row, deps);
      }
      await queue.markProcessed({
        id,
        status: 'done',
        env,
        row,
        deps,
      });
      processed += 1;
    } catch (err) {
      await queue.markProcessed({
        id,
        status: 'error',
        error: err && err.message ? err.message : String(err),
        env,
        row,
        deps,
      });
      processed += 1;
    }
  }

  const remaining = await queue.countRemaining({ env, deps });
  // Signup persist is FR-051c — keep empty here.
  return {
    processed,
    remaining: Number(remaining) || 0,
    signups: [],
  };
}

module.exports = {
  runOnce,
  resolveEnvName,
  createMemoryPendingQueue,
  bindQueue,
};
