'use strict';

/**
 * FR-3951 walrus drain runner entry.
 * Outbound HTTPS only (SQS Receive/Delete/ChangeVisibility). No inbound port.
 *
 * Env:
 *   SQS_DB_BACKED_URL (or SQS_DB_BACKED_LIVE_URL / SANDBOX) --- queue URL from CDK sibling
 *   A_CLUBS_ROOT --- mapped a-clubs bucket root (e.g. D:\s3\a-clubs)
 *   MSSQL_DATABASE --- must be a_search or a_search_sandbox (madeiradb rejected)
 *   A_SEARCH_ENV --- live|sandbox
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

  console.log(
    JSON.stringify({
      service: 'a-search-walrus-drain',
      queueUrl: queueUrl.replace(/\/\/.*@/, '//'),
      aClubsRoot,
      waitTimeSeconds: DEFAULT_WAIT_S,
      mssqlDatabase: String(process.env.MSSQL_DATABASE || '').trim(),
      note: 'Inject AWS SQS client in production host start script; outbound HTTPS only',
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
  main,
};
