'use strict';

/**
 * FR-058c: space provider HTTP calls by minIntervalMs (SQS pacing companion).
 * CDK concurrency is out of scope — this only delays between calls.
 */

/**
 * @param {{
 *   minIntervalMs: number,
 *   now?: () => number,
 *   sleep?: (ms: number) => Promise<void>,
 * }} opts
 * @returns {{
 *   wait: () => Promise<void>,
 *   reset: () => void,
 *   minIntervalMs: number,
 * }}
 */
function createMinIntervalPacer(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new TypeError('createMinIntervalPacer: opts object required');
  }
  const minIntervalMs = Number(opts.minIntervalMs);
  if (!Number.isFinite(minIntervalMs) || minIntervalMs < 0) {
    throw new TypeError(
      `createMinIntervalPacer: minIntervalMs must be a non-negative number, got ${JSON.stringify(opts.minIntervalMs)}`,
    );
  }
  const now =
    typeof opts.now === 'function' ? opts.now : () => Date.now();
  const sleep =
    typeof opts.sleep === 'function'
      ? opts.sleep
      : (ms) =>
          new Promise((resolve) => {
            setTimeout(resolve, ms);
          });

  let lastAt = null;

  async function wait() {
    if (minIntervalMs === 0) {
      lastAt = now();
      return;
    }
    const t = now();
    if (lastAt != null) {
      const elapsed = t - lastAt;
      const need = minIntervalMs - elapsed;
      if (need > 0) {
        await sleep(need);
      }
    }
    lastAt = now();
  }

  function reset() {
    lastAt = null;
  }

  return { wait, reset, minIntervalMs };
}

/**
 * Convert messagesPerSecond → minIntervalMs (ceil). Returns 0 for non-positive.
 * @param {number} messagesPerSecond
 * @returns {number}
 */
function minIntervalMsFromMessagesPerSecond(messagesPerSecond) {
  const mps = Number(messagesPerSecond);
  if (!Number.isFinite(mps) || mps <= 0) return 0;
  return Math.ceil(1000 / mps);
}

module.exports = {
  createMinIntervalPacer,
  minIntervalMsFromMessagesPerSecond,
};
