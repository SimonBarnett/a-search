'use strict';

/**
 * FR #4916: a-searches CLI / SEA entry.
 * --version exits 0 without AWS. Default loop is hourly (A_SEARCHES_LOOP_MS=3600000).
 * Set A_SEARCHES_LOOP_MS=0 for a single pass then exit.
 */

const { version: PKG_VERSION } = require('../../package.json');
const { runHourlySearches } = require('./runHourly');
const { createPostSearchRunner } = require('./postSearch');

/**
 * @param {string[]} argv
 * @param {{ runHourly?: Function, createS3?: Function, createRunner?: Function, env?: NodeJS.ProcessEnv, log?: Function, sleep?: Function }} [deps]
 * @returns {Promise<number>} exit code
 */
async function main(argv, deps) {
  const args = argv.slice();
  const env = (deps && deps.env) || process.env;
  const log = (deps && deps.log) || ((line) => process.stdout.write(`${line}\n`));

  if (args.includes('--version') || args.includes('-V')) {
    log(`a-searches ${env.A_SEARCHES_VERSION || PKG_VERSION || '0.1.0'}`);
    return 0;
  }

  const loopRaw = env.A_SEARCHES_LOOP_MS;
  const loopMs =
    loopRaw === undefined || loopRaw === ''
      ? 3600000
      : Number(loopRaw);

  const runOnce = async () => {
    const createS3 =
      (deps && deps.createS3) ||
      (async () => {
        const {
          S3Client,
          HeadObjectCommand,
          ListObjectsV2Command,
          GetObjectCommand,
          PutObjectCommand,
        } = require('@aws-sdk/client-s3');
        const client = new S3Client({
          region: env.AWS_REGION || env.A_SEARCH_AWS_REGION || 'eu-west-2',
        });
        return {
          async headObject(p) {
            return client.send(new HeadObjectCommand(p));
          },
          async listObjectsV2(p) {
            return client.send(new ListObjectsV2Command(p));
          },
          async getObject(p) {
            return client.send(new GetObjectCommand(p));
          },
          async putObject(p) {
            return client.send(new PutObjectCommand(p));
          },
        };
      });

    const s3 = await createS3();
    const createRunner =
      (deps && deps.createRunner) ||
      ((s3Client) =>
        createPostSearchRunner({
          s3: s3Client,
          bucket: env.A_CLUBS_BUCKET || 'a-clubs',
          apiUrl: env.A_SEARCH_API_URL || env.A_SEARCH_SEARCH_API_URL || '',
          env,
        }));
    const runSearch = await Promise.resolve(createRunner(s3));

    const runHourly = (deps && deps.runHourly) || runHourlySearches;
    const summary = await runHourly({
      s3,
      bucket: env.A_CLUBS_BUCKET || 'a-clubs',
      runSearch,
      log,
      hasCredentials: () =>
        Boolean(
          env.A_SEARCH_API_URL ||
            env.A_SEARCH_SEARCH_API_URL ||
            env.AWS_PROFILE ||
            env.AWS_ACCESS_KEY_ID ||
            env.A_SEARCHES_FORCE_CREDS === '1',
        ),
    });
    log(
      `summary ran=${summary.ran} skipped=${summary.skipped} failed=${summary.failed} warnings=${(summary.warnings || []).join(',')}`,
    );
    return summary.failed > 0 && summary.ran === 0 ? 1 : 0;
  };

  if (!Number.isFinite(loopMs) || loopMs <= 0) {
    return runOnce();
  }

  const sleep =
    (deps && deps.sleep) || ((ms) => new Promise((r) => setTimeout(r, ms)));
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await runOnce();
    } catch (err) {
      log(`error ${(err && err.message) || err}`);
    }
    await sleep(loopMs);
  }
}

module.exports = { main };

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${(err && err.stack) || err}\n`);
      process.exit(1);
    },
  );
}
