'use strict';

/**
 * FR #4196: walrus drains a-search-affiliate-import (outbound SQS long-poll).
 * Simon: drain host is walrus (writes a-search DB; never madeiradb). Reuses
 * redqueen/affiliate-import processOneFile / drainImportOnce parsing until the
 * full #4001 tree is relocated.
 */

const path = require('node:path');
const { createSqsPoll, DEFAULT_WAIT_S } = require('./sqsPoll');
const { createDrainRunner } = require('./drainRunner');
const {
  drainImportOnce,
  parseImportMessageBody,
} = require('../../redqueen/affiliate-import/src/drainImport');
const {
  assertWritableDatabaseFromEnv,
} = require('./dbWriterGuard');

/**
 * @param {NodeJS.ProcessEnv} [envVars]
 * @returns {string}
 */
function resolveAffiliateImportQueueUrl(envVars) {
  const env = envVars || process.env;
  return String(
    env.A_SEARCH_AFFILIATE_IMPORT_QUEUE_URL ||
      env.SQS_AFFILIATE_IMPORT_URL ||
      '',
  ).trim();
}

/**
 * One-shot drain using the affiliate-import message shape.
 * Prefer this over createDrainRunner when the job is multi-file per message.
 * @param {object} opts --- same injectors as drainImportOnce + queue helpers
 */
async function drainAffiliateImportOnce(opts) {
  return drainImportOnce(opts);
}

/**
 * Build a long-poll runner that treats each SQS body as affiliate-import.
 * Deletes only after drainImportOnce reports no hard failure for that message.
 * @param {{
 *   queue: { receive: Function, deleteMessage: Function, changeVisibility?: Function },
 *   importDeps: object,
 * }} opts
 */
function createAffiliateImportDrainRunner(opts) {
  if (!opts || !opts.queue) throw new Error('queue_required');
  return createDrainRunner({
    queue: opts.queue,
    async runJob(body, jobDeps) {
      const parsed = parseImportMessageBody(body);
      if (parsed.kind && parsed.kind !== 'affiliate-import') {
        return { ok: true, skipped: 'ignored_kind' };
      }
      // Synthetic single-message receive for drainImportOnce internals
      const fakeReceive = async () => ({
        Messages: [
          {
            MessageId: 'local',
            ReceiptHandle: 'local',
            Body: typeof body === 'string' ? body : JSON.stringify(body),
          },
        ],
      });
      const deleted = [];
      const result = await drainImportOnce({
        ...(opts.importDeps || {}),
        ...(jobDeps || {}),
        queueUrl: 'local',
        receiveMessage: fakeReceive,
        deleteMessage: async () => {
          deleted.push(1);
        },
        startFixAgent: (opts.importDeps && opts.importDeps.startFixAgent) !== false,
      });
      const hardFail = (result.failed || []).length > 0;
      return {
        ok: !hardFail,
        result,
        deleted: deleted.length,
      };
    },
  });
}

async function main() {
  const queueUrl = resolveAffiliateImportQueueUrl(process.env);
  if (!queueUrl) {
    console.error(
      'A_SEARCH_AFFILIATE_IMPORT_QUEUE_URL (or SQS_AFFILIATE_IMPORT_URL) required',
    );
    process.exit(2);
  }
  try {
    assertWritableDatabaseFromEnv(process.env);
  } catch (err) {
    console.error(err.message || err);
    process.exit(2);
  }

  console.log(
    JSON.stringify({
      service: 'a-search-walrus-affiliate-import-drain',
      queueUrl: queueUrl.replace(/\/\/.*@/, '//'),
      waitTimeSeconds: DEFAULT_WAIT_S,
      modules: path.join('redqueen', 'affiliate-import'),
      note:
        'FR #4196: walrus long-polls import SQS; inject AWS client + S3/DB in host start script',
    }),
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  resolveAffiliateImportQueueUrl,
  drainAffiliateImportOnce,
  createAffiliateImportDrainRunner,
  createSqsPoll,
  main,
};
