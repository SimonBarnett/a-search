'use strict';

/**
 * FR-3951 / FR #4447 walrus SQL drain runner entry.
 * Outbound HTTPS only (SQS Receive/Delete/ChangeVisibility). No inbound port.
 * Long-polls a-search-db-backed, runs providers/local/{source} (sql), writes
 * a-clubs/{host}/{guid}/IN/ on the mapped drive.
 *
 * Env:
 *   SQS_DB_BACKED_URL (or SQS_DB_BACKED_LIVE_URL / SANDBOX) --- queue URL from CDK sibling
 *   A_CLUBS_ROOT --- mapped a-clubs bucket root (e.g. D:\s3\a-clubs)
 *   MSSQL_DATABASE --- must be a_search or a_search_sandbox (madeiradb rejected for writers)
 *   A_SEARCH_ENV --- live|sandbox
 *   AWS_REGION / AWS_PROFILE --- for outbound SQS client
 */

const { createDrainRunner } = require('./drainRunner');
const { createSqsPoll, DEFAULT_WAIT_S } = require('./sqsPoll');
const { aClubsInKey, aClubsInAbsPath, hostGuidFromMessage } = require('./aClubsInPath');
const {
  assertWritableDatabase,
  assertWritableDatabaseFromEnv,
  WRITE_DATABASES,
} = require('./dbWriterGuard');
const { writeAClubsIn, createAClubsPutObject } = require('./writeAClubsIn');
const { runDrainJob, isMaintainerJob, localWorkerPath } = require('./runJob');
const { createTouchLastmodFs } = require('./touchLastmodFs');

function resolveQueueUrl(envVars) {
  const env = envVars || process.env;
  const aSearchEnv = String(env.A_SEARCH_ENV || '').trim().toLowerCase();
  if (aSearchEnv === 'live' && env.SQS_DB_BACKED_LIVE_URL) {
    return String(env.SQS_DB_BACKED_LIVE_URL).trim();
  }
  if (aSearchEnv === 'sandbox' && env.SQS_DB_BACKED_SANDBOX_URL) {
    return String(env.SQS_DB_BACKED_SANDBOX_URL).trim();
  }
  return String(env.SQS_DB_BACKED_URL || '').trim();
}

/**
 * Build SQS poll + drain runner from env (injectable client for tests).
 * @param {{
 *   envVars?: Record<string, string|undefined>,
 *   client?: { send: Function },
 *   createSqsClient?: () => { send: Function },
 *   jobDeps?: object,
 * }} [opts]
 */
function createWalrusDrain(opts) {
  const envVars = (opts && opts.envVars) || process.env;
  const queueUrl = resolveQueueUrl(envVars);
  const aClubsRoot = String(
    envVars.A_CLUBS_ROOT || envVars.A_SEARCH_A_CLUBS_ROOT || '',
  ).trim();
  if (!queueUrl) {
    throw new Error('SQS_DB_BACKED_URL (or live/sandbox variant) required');
  }
  if (!aClubsRoot) {
    throw new Error('A_CLUBS_ROOT required');
  }
  assertWritableDatabaseFromEnv(envVars);

  let client = opts && opts.client;
  if (!client) {
    if (opts && typeof opts.createSqsClient === 'function') {
      client = opts.createSqsClient();
    } else {
      // Lazy require so unit tests that only import helpers stay light.
      // eslint-disable-next-line global-require
      const { SQSClient } = require('@aws-sdk/client-sqs');
      client = new SQSClient({});
    }
  }

  const queue = createSqsPoll({ client, queueUrl });
  const touchLastmod =
    (opts && opts.jobDeps && opts.jobDeps.touchLastmod) ||
    createTouchLastmodFs(aClubsRoot);

  const runner = createDrainRunner({
    queue,
    jobDeps: {
      aClubsRoot,
      envVars,
      touchLastmod,
      ...((opts && opts.jobDeps) || {}),
    },
  });

  return { queueUrl, aClubsRoot, queue, runner, waitTimeSeconds: DEFAULT_WAIT_S };
}

/**
 * Long-poll forever. Stops when runner.stop() is called or process signals.
 * @param {{
 *   envVars?: Record<string, string|undefined>,
 *   client?: { send: Function },
 *   createSqsClient?: () => { send: Function },
 *   jobDeps?: object,
 *   maxLoops?: number,
 *   log?: (line: string) => void,
 * }} [opts]
 */
async function runLoop(opts) {
  const built = createWalrusDrain(opts);
  const log = (opts && opts.log) || ((line) => console.log(line));
  log(
    JSON.stringify({
      service: 'a-search-walrus-sql-drain',
      queueUrl: built.queueUrl.replace(/\/\/.*@/, '//'),
      aClubsRoot: built.aClubsRoot,
      waitTimeSeconds: built.waitTimeSeconds,
      mssqlDatabase: String(
        ((opts && opts.envVars) || process.env).MSSQL_DATABASE || '',
      ).trim(),
      note: 'outbound HTTPS SQS long-poll; no inbound port',
    }),
  );

  const maxLoops = opts && opts.maxLoops != null ? Number(opts.maxLoops) : 0;
  let i = 0;
  while (maxLoops <= 0 || i < maxLoops) {
    i += 1;
    const once = await built.runner.processOnce();
    if (once && once.stopped) break;
    if (once && once.ok === false && once.error) {
      log(
        JSON.stringify({
          service: 'a-search-walrus-sql-drain',
          level: 'warn',
          error: once.error,
          outcome: once.outcome || null,
        }),
      );
    }
  }
  return { loops: i, runner: built.runner };
}

async function main() {
  const queueUrl = resolveQueueUrl(process.env);
  const aClubsRoot = String(
    process.env.A_CLUBS_ROOT || process.env.A_SEARCH_A_CLUBS_ROOT || '',
  ).trim();
  if (!queueUrl) {
    console.error('SQS_DB_BACKED_URL (or live/sandbox variant) required');
    process.exit(2);
  }
  if (!aClubsRoot) {
    console.error('A_CLUBS_ROOT required');
    process.exit(2);
  }
  try {
    assertWritableDatabaseFromEnv(process.env);
  } catch (err) {
    console.error(err.message || err);
    process.exit(2);
  }

  await runLoop({});
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  createDrainRunner,
  createSqsPoll,
  DEFAULT_WAIT_S,
  aClubsInKey,
  aClubsInAbsPath,
  hostGuidFromMessage,
  assertWritableDatabase,
  assertWritableDatabaseFromEnv,
  WRITE_DATABASES,
  writeAClubsIn,
  createAClubsPutObject,
  runDrainJob,
  isMaintainerJob,
  localWorkerPath,
  resolveQueueUrl,
  createWalrusDrain,
  runLoop,
  createTouchLastmodFs,
  main,
};
