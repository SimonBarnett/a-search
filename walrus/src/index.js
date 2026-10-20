'use strict';

/**
 * FR-3951 / FR #4447 / FR #4511 walrus SQL drain runner entry.
 * Outbound HTTPS only (SQS Receive/Delete/ChangeVisibility). No inbound port.
 * Long-polls a-search-db-backed, runs providers/local/{source} (sql), writes
 * a-clubs/{host}/{guid}/IN/ on the mapped drive.
 *
 * Env (all required at startup --- FR #4511 lists missing and exits before Receive):
 *   SQS_DB_BACKED_URL (or SQS_DB_BACKED_LIVE_URL / SANDBOX)
 *   A_CLUBS_ROOT --- mapped a-clubs bucket root (e.g. D:\s3\a-clubs)
 *   AWS_REGION --- for outbound SQS client
 *   MSSQL_SERVER / MSSQL_DATABASE --- a_search or a_search_sandbox (madeiradb rejected)
 *   MSSQL_USER + MSSQL_PASSWORD --- or MSSQL_TRUSTED_CONNECTION=true under a service account
 *   A_SEARCH_ENV / AWS_PROFILE --- optional helpers (profile set by the nssm register script)
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
const {
  REQUIRED_DRAIN_ENV_KEYS,
  resolveQueueUrl,
  listMissingDrainEnv,
  assertDrainEnv,
} = require('./drainEnv');

/**
 * Build SQS poll + drain runner from env (injectable client for tests).
 * Throws before creating an SQS client when required env is missing (FR #4511).
 * @param {{
 *   envVars?: Record<string, string|undefined>,
 *   client?: { send: Function },
 *   createSqsClient?: () => { send: Function },
 *   jobDeps?: object,
 * }} [opts]
 */
function createWalrusDrain(opts) {
  const envVars = (opts && opts.envVars) || process.env;
  const gate = assertDrainEnv(envVars);
  if (!gate.ok) {
    throw new Error(gate.message);
  }
  const queueUrl = resolveQueueUrl(envVars);
  const aClubsRoot = String(
    envVars.A_CLUBS_ROOT || envVars.A_SEARCH_A_CLUBS_ROOT || '',
  ).trim();

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
    let once;
    try {
      // FR #4534: never let a single message crash the long-poll loop.
      once = await built.runner.processOnce();
    } catch (err) {
      log(
        JSON.stringify({
          service: 'a-search-walrus-sql-drain',
          level: 'error',
          error:
            err && err.message
              ? err.message
              : err && err.code
                ? err.code
                : 'processOnce_threw',
        }),
      );
      continue;
    }
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

/**
 * @param {{
 *   envVars?: Record<string, string|undefined>,
 *   createSqsClient?: () => { send: Function },
 *   client?: { send: Function },
 *   exit?: (code: number) => void,
 *   error?: (line: string) => void,
 *   run?: typeof runLoop,
 * }} [opts]
 */
async function main(opts) {
  const envVars = (opts && opts.envVars) || process.env;
  const error = (opts && opts.error) || ((line) => console.error(line));
  const exitFn =
    (opts && opts.exit) ||
    ((code) => {
      process.exit(code);
    });
  const gate = assertDrainEnv(envVars);
  if (!gate.ok) {
    error(gate.message);
    exitFn(2);
    return { exited: 2, missing: gate.missing };
  }

  const run = (opts && opts.run) || runLoop;
  await run({
    envVars,
    client: opts && opts.client,
    createSqsClient: opts && opts.createSqsClient,
  });
  return { exited: 0 };
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
  listMissingDrainEnv,
  assertDrainEnv,
  REQUIRED_DRAIN_ENV_KEYS,
  createWalrusDrain,
  runLoop,
  createTouchLastmodFs,
  main,
};
