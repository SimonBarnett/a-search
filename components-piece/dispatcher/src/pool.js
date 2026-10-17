'use strict';

/**
 * Deterministic idle agent pool (#1343).
 * Workers block on a local job channel; no LLM while idle.
 */

function createAgentPool(opts) {
  const size = Math.max(1, (opts && opts.size) || 2);
  const runJob = opts && opts.runJob;
  if (typeof runJob !== 'function') {
    throw new Error('runJob required');
  }
  const llm = (opts && opts.llm) || { tokensUsed: 0, calls: 0 };
  const mount = (opts && opts.mount) || { reads: 0, writes: 0 };

  /** @type {Array<{ id: number, busy: boolean }>} */
  const workers = [];
  for (let i = 0; i < size; i++) {
    workers.push({ id: i, busy: false });
  }

  function idleCount() {
    return workers.filter((w) => !w.busy).length;
  }

  function takeIdle() {
    const w = workers.find((x) => !x.busy);
    if (!w) return null;
    w.busy = true;
    return w;
  }

  function release(worker) {
    worker.busy = false;
  }

  /**
   * Run one job on an idle worker. Idle path never touches llm or mount.
   * @returns {Promise<{ ok: boolean, result?: object, error?: string, workerId: number }|null>}
   */
  async function dispatch(job) {
    const w = takeIdle();
    if (!w) return null;
    const startedAt = new Date().toISOString();
    try {
      const result = await runJob(job, { llm, mount, workerId: w.id });
      return {
        ok: true,
        result,
        workerId: w.id,
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : String(err),
        workerId: w.id,
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    } finally {
      release(w);
    }
  }

  return {
    size,
    idleCount,
    dispatch,
    llm,
    mount,
    workers: () => workers.map((w) => ({ ...w })),
  };
}

module.exports = { createAgentPool };