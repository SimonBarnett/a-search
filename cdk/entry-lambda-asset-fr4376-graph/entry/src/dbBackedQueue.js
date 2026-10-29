'use strict';

/**
 * FR-3950: DB-backed (registry kind:local) search work shares one SQS queue.
 * CDK sibling creates the queue; entry only resolves SQS_DB_BACKED_* URLs.
 * Live providers (kind:live) keep per-source queues.
 */

/** @type {string} */
const DB_BACKED_QUEUE_ENV = 'SQS_DB_BACKED_URL';

/**
 * @param {{ kind?: string } | null | undefined} entry
 * @returns {boolean}
 */
function isDbBackedSource(entry) {
  return !!(entry && entry.kind === 'local');
}

/**
 * queueEnv token for resolveQueueUrl (live/sandbox preferred keys apply).
 * @param {{ kind?: string, queueEnv?: string } | null | undefined} entry
 * @returns {string}
 */
function queueEnvForSource(entry) {
  if (isDbBackedSource(entry)) {
    return DB_BACKED_QUEUE_ENV;
  }
  if (!entry || !entry.queueEnv) {
    throw new Error('registry entry missing queueEnv');
  }
  return entry.queueEnv;
}

module.exports = {
  DB_BACKED_QUEUE_ENV,
  isDbBackedSource,
  queueEnvForSource,
};
