'use strict';

/**
 * FR #4236: retry S3/SQS writes after a long review. Kept-alive sockets
 * die with ECONNABORTED / ECONNRESET / EPIPE / ETIMEDOUT while Node was busy.
 */

const TRANSIENT = /ECONNABORTED|ECONNRESET|EPIPE|ETIMEDOUT|EAI_AGAIN|socket hang up/i;

/**
 * @param {() => Promise<unknown>} fn
 * @param {number} [attempts]
 */
async function withSocketRetry(fn, attempts) {
  const n = attempts == null ? 3 : attempts;
  let last;
  for (let i = 0; i < n; i += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const msg = String((err && (err.code || err.message)) || err);
      if (!TRANSIENT.test(msg) || i === n - 1) throw err;
      await new Promise((r) => {
        setTimeout(r, 20 * (i + 1));
      });
    }
  }
  throw last;
}

module.exports = {
  withSocketRetry,
  TRANSIENT,
};
