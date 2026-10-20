'use strict';

/**
 * FR-3951: walrus drain loop --- long-poll SQS, run local SQL work, write a-clubs IN/.
 * Deletes only after a successful job; failures ChangeVisibility(0) for retry.
 */

const { DEFAULT_WAIT_S } = require('./sqsPoll');
const { runDrainJob } = require('./runJob');

/**
 * @param {object} opts
 * @param {{ receive: Function, deleteMessage: Function, changeVisibility?: Function }} opts.queue
 * @param {typeof runDrainJob} [opts.runJob]
 * @param {object} [opts.jobDeps]
 */
function createDrainRunner(opts) {
  if (!opts || !opts.queue || typeof opts.queue.receive !== 'function') {
    throw new Error('queue_required');
  }
  if (typeof opts.queue.deleteMessage !== 'function') {
    throw new Error('queue_delete_required');
  }
  const runJob = opts.runJob || runDrainJob;
  const jobDeps = opts.jobDeps || {};
  let stopped = false;

  /**
   * One receive → handle → delete/retry cycle.
   * @returns {Promise<object>}
   */
  async function processOnce() {
    if (stopped) return { stopped: true };
    const msgs = await opts.queue.receive();
    if (!msgs || msgs.length === 0) {
      return { empty: true, waitTimeSeconds: DEFAULT_WAIT_S };
    }
    const msg = msgs[0];
    const receipt = msg.ReceiptHandle;
    let body;
    try {
      body =
        typeof msg.Body === 'string' ? JSON.parse(msg.Body) : msg.Body || msg;
    } catch {
      if (typeof opts.queue.changeVisibility === 'function') {
        await opts.queue.changeVisibility(receipt, 0);
      }
      return { ok: false, error: 'bad_json' };
    }

    try {
      const outcome = await runJob(body, jobDeps);
      if (outcome && outcome.ok) {
        await opts.queue.deleteMessage(receipt);
        return { ok: true, outcome };
      }
      // FR #4534: never delete on failure; release for retry / visibility timeout.
      if (typeof opts.queue.changeVisibility === 'function') {
        try {
          await opts.queue.changeVisibility(receipt, 0);
        } catch {
          /* leave message to time out */
        }
      }
      return { ok: false, outcome };
    } catch (err) {
      // FR #4534: connection/query errors must not crash the process or delete.
      if (typeof opts.queue.changeVisibility === 'function') {
        try {
          await opts.queue.changeVisibility(receipt, 0);
        } catch {
          /* leave message to time out */
        }
      }
      return {
        ok: false,
        error: err && err.code ? err.code : err && err.message ? err.message : 'job_failed',
      };
    }
  }

  /**
   * @param {number} [maxLoops]
   */
  async function runUntilEmpty(maxLoops) {
    const limit = maxLoops || 100;
    const results = [];
    for (let i = 0; i < limit; i++) {
      if (stopped) break;
      const r = await processOnce();
      results.push(r);
      if (r.empty || r.stopped) break;
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
    waitTimeSeconds: DEFAULT_WAIT_S,
  };
}

module.exports = { createDrainRunner };
