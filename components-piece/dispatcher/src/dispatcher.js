'use strict';

/**
 * Deterministic SQS long-poll dispatcher (#1343).
 * No LLM in the wrapper. Deletes message only after agent reports ok.
 */

const { createAgentPool } = require('./pool');
const { runAgentJob } = require('./runJob');

function createDispatcher(opts) {
  const queue = opts.queue;
  if (!queue || typeof queue.receive !== 'function') {
    throw new Error('queue required');
  }
  const resolveTier =
    opts.resolveTier ||
    (() => ({ upgraded: false, layout: 'horizontal' }));
  const root = opts.root || '';
  const passes = opts.passes;
  const pool = createAgentPool({
    size: opts.poolSize || Number(process.env.AGENT_POOL_SIZE || 2),
    runJob: async (job, ctx) =>
      runAgentJob(job, { ...ctx, root, passes }),
    llm: opts.llm || { tokensUsed: 0, calls: 0 },
    mount: opts.mount || { reads: 0, writes: 0 },
  });

  let stopped = false;

  async function processOnce() {
    if (pool.idleCount() < 1) {
      return { skipped: 'no_idle_worker' };
    }
    const msgs = queue.receive(1);
    if (!msgs || msgs.length === 0) {
      return { empty: true };
    }
    const msg = msgs[0];
    let body;
    try {
      body = JSON.parse(msg.MessageBody);
    } catch (err) {
      queue.failMessage(msg.ReceiptHandle);
      return { ok: false, error: 'bad_json' };
    }
    const tier = resolveTier(body);
    const job = { ...body, tier };
    const outcome = await pool.dispatch(job);
    if (!outcome) {
      // Should not happen after idleCount check; leave for retry
      queue.failMessage(msg.ReceiptHandle);
      return { ok: false, error: 'no_worker' };
    }
    if (outcome.ok) {
      queue.deleteMessage(msg.ReceiptHandle);
      return { ok: true, outcome, groupId: msg.MessageGroupId };
    }
    queue.failMessage(msg.ReceiptHandle);
    return { ok: false, outcome, groupId: msg.MessageGroupId };
  }

  async function runUntilEmpty(maxLoops) {
    const limit = maxLoops || 100;
    const results = [];
    for (let i = 0; i < limit; i++) {
      if (stopped) break;
      const r = await processOnce();
      results.push(r);
      if (r.empty) break;
      if (r.skipped === 'no_idle_worker') break;
    }
    return results;
  }

  function stop() {
    stopped = true;
  }

  return {
    processOnce,
    runUntilEmpty,
    stop,
    pool,
    queue,
  };
}

module.exports = { createDispatcher };