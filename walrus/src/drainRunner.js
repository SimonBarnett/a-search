'use strict';

/**
 * FR-3951 / FR #4570: walrus drain loop --- long-poll SQS, run local SQL work,
 * write a-clubs IN/. Deletes only after a successful job; failures
 * ChangeVisibility(0) for retry. One INFO log line per message.
 */

const { DEFAULT_WAIT_S } = require('./sqsPoll');

/**
 * FR #5222: ApproximateReceiveCount from an SQS message.
 * @param {object} msg
 * @returns {number}
 */
function receiveCountFromSqsMessage(msg) {
  const attrs = (msg && msg.Attributes) || (msg && msg.attributes) || {};
  const n = Number(
    attrs.ApproximateReceiveCount != null
      ? attrs.ApproximateReceiveCount
      : attrs.approximateReceiveCount,
  );
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

const { runDrainJob } = require('./runJob');
const { reportDlqFailure } = require('../../shared/intake/reportDlqFailure');

/**
 * FR #4570: one INFO JSON line per drained message (no secrets / query PII).
 * @param {{
 *   disposition?: string,
 *   searchid?: string,
 *   host?: string,
 *   guid?: string,
 *   productCount?: number,
 *   durationMs?: number,
 *   error?: string,
 * }} fields
 * @returns {string}
 */
function formatDrainMessageLog(fields) {
  const f = fields || {};
  return JSON.stringify({
    service: 'a-search-walrus-sql-drain',
    level: 'info',
    searchid: f.searchid != null ? String(f.searchid) : '',
    host: f.host != null ? String(f.host) : '',
    guid: f.guid != null ? String(f.guid) : '',
    productCount:
      typeof f.productCount === 'number' && Number.isFinite(f.productCount)
        ? f.productCount
        : 0,
    durationMs:
      typeof f.durationMs === 'number' && Number.isFinite(f.durationMs)
        ? f.durationMs
        : 0,
    outcome: f.disposition || f.outcome || 'error',
    error: f.error != null ? String(f.error) : undefined,
  });
}

/**
 * @param {object} body
 * @returns {{ searchid: string, host: string, guid: string }}
 */
function messageIdsFromBody(body) {
  const msg = body && typeof body === 'object' ? body : {};
  return {
    searchid: String(
      msg.searchid != null ? msg.searchid : msg.searchId || '',
    ).trim(),
    host: String(msg.hostkey || msg.host || '').trim(),
    guid: String(msg.guid || msg.widgetGuid || '').trim(),
  };
}

/**
 * @param {object|undefined} outcome
 * @returns {number}
 */
function productCountFromOutcome(outcome) {
  if (!outcome || typeof outcome !== 'object') return 0;
  const result = outcome.result;
  if (result && Array.isArray(result.products)) return result.products.length;
  if (Array.isArray(outcome.products)) return outcome.products.length;
  return 0;
}

/**
 * @param {object} opts
 * @param {{ receive: Function, deleteMessage: Function, changeVisibility?: Function }} opts.queue
 * @param {typeof runDrainJob} [opts.runJob]
 * @param {object} [opts.jobDeps]
 * @param {(line: string) => void} [opts.log]
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
  const log =
    typeof opts.log === 'function' ? opts.log : (line) => console.log(line);
  const maxReceive =
    Number(opts.maxReceiveCount) > 0
      ? Math.floor(Number(opts.maxReceiveCount))
      : 3;
  const queueUrl = String((opts.queue && opts.queue.queueUrl) || opts.queueUrl || '').trim();
  const dlqUrl = String(opts.dlqUrl || '').trim();
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
    const started = Date.now();
    let body;
    try {
      body =
        typeof msg.Body === 'string' ? JSON.parse(msg.Body) : msg.Body || msg;
    } catch {
      if (typeof opts.queue.changeVisibility === 'function') {
        await opts.queue.changeVisibility(receipt, 0);
      }
      const durationMs = Date.now() - started;
      const once = {
        ok: false,
        error: 'bad_json',
        disposition: 'error',
        searchid: '',
        host: '',
        guid: '',
        productCount: 0,
        durationMs,
      };
      log(formatDrainMessageLog(once));
      return once;
    }

    const ids = messageIdsFromBody(body);

    try {
      const outcome = await runJob(body, jobDeps);
      const durationMs = Date.now() - started;
      const productCount = productCountFromOutcome(outcome);
      if (outcome && outcome.ok) {
        await opts.queue.deleteMessage(receipt);
        const once = {
          ok: true,
          outcome,
          disposition: 'written',
          productCount,
          durationMs,
          ...ids,
        };
        log(formatDrainMessageLog(once));
        return once;
      }
      // FR #4534: never delete on failure; release for retry / visibility timeout.
      {
        const err = new Error('drain_job_not_ok');
        err.code = 'drain_job_not_ok';

      const recvCount = receiveCountFromSqsMessage(msg);
      if (recvCount >= maxReceive) {
        try {
          await reportDlqFailure({
            err: err || new Error('drain_job_failed'),
            msg: body,
            provider: String((body && body.source) || 'sql').trim() || 'sql',
            source: String((body && body.source) || 'sql').trim() || 'sql',
            searchid: ids.searchid,
            host: ids.host,
            guid: ids.guid,
            queueUrl,
            dlqUrl,
            path: 'maxReceiveCount',
            receiveCount: recvCount,
            queries: body && body.queries,
            q: body && body.q,
            fetch: opts.fetch,
            intakeUrl: opts.intakeUrl,
            logError: opts.logError,
            route: 'walrus/src/drainRunner#maxReceiveCount',
          });
        } catch {
          /* fail-soft */
        }
      }

      }
      if (typeof opts.queue.changeVisibility === 'function') {
        try {
          await opts.queue.changeVisibility(receipt, 0);
        } catch {
          /* leave message to time out */
        }
      }
      const once = {
        ok: false,
        outcome,
        disposition: 'released',
        productCount,
        durationMs,
        ...ids,
      };
      log(formatDrainMessageLog(once));
      return once;
    } catch (err) {
      // FR #4534: connection/query errors must not crash the process or delete.

      const recvCount = receiveCountFromSqsMessage(msg);
      if (recvCount >= maxReceive) {
        try {
          await reportDlqFailure({
            err: err || new Error('drain_job_failed'),
            msg: body,
            provider: String((body && body.source) || 'sql').trim() || 'sql',
            source: String((body && body.source) || 'sql').trim() || 'sql',
            searchid: ids.searchid,
            host: ids.host,
            guid: ids.guid,
            queueUrl,
            dlqUrl,
            path: 'maxReceiveCount',
            receiveCount: recvCount,
            queries: body && body.queries,
            q: body && body.q,
            fetch: opts.fetch,
            intakeUrl: opts.intakeUrl,
            logError: opts.logError,
            route: 'walrus/src/drainRunner#maxReceiveCount',
          });
        } catch {
          /* fail-soft */
        }
      }

      if (typeof opts.queue.changeVisibility === 'function') {
        try {
          await opts.queue.changeVisibility(receipt, 0);
        } catch {
          /* leave message to time out */
        }
      }
      const durationMs = Date.now() - started;
      const once = {
        ok: false,
        error:
          err && err.code === 'sql_query_failed'
            ? err.message
            : err && err.code
              ? err.code
              : err && err.message
                ? err.message
                : 'job_failed',
        disposition: 'error',
        productCount: 0,
        durationMs,
        ...ids,
      };
      log(formatDrainMessageLog(once));
      return once;
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

module.exports = {
  createDrainRunner,
  receiveCountFromSqsMessage,
  formatDrainMessageLog,
  messageIdsFromBody,
  productCountFromOutcome,
};
