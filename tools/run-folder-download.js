'use strict';

/**
 * FR #4108 / #4167: Node entry for tools/download --- calls folderDownloadOne (downloadOne).
 * Usage:
 *   node tools/run-folder-download.js <json-args>
 *   node tools/run-folder-download.js --args-env   (FR #4167: JSON in A_SEARCH_FOLDER_DOWNLOAD_ARGS)
 * JSON: { provider, affiliateId, bucket, force?, dryRun?, affiliateMeta?, awsProfile?, region? }
 * Prints one JSON line to stdout (no secrets / no feedurl value).
 * Prefer --args-env so WinPS 5.1 cannot mangle quotes and feedurl never appears on the process command line.
 */

const {
  folderDownloadOne,
  redactResult,
} = require('../affiliates/src/folderDownloadOne');

const ARGS_ENV = 'A_SEARCH_FOLDER_DOWNLOAD_ARGS';

/**
 * @param {string[]} argv
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {object}
 */
function loadArgs(argv, env) {
  const e = env || process.env;
  const mode = argv[2] || '';
  let raw = '';
  if (mode === '--args-env') {
    raw = e[ARGS_ENV] || '';
    try {
      delete e[ARGS_ENV];
    } catch {
      /* ignore */
    }
    if (typeof process !== 'undefined' && process.env && e === process.env) {
      try {
        delete process.env[ARGS_ENV];
      } catch {
        /* ignore */
      }
    }
  } else {
    raw = mode;
  }
  if (!raw) {
    const err = new Error('usage');
    err.code = 'usage';
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error('invalid_json_args');
    err.code = 'invalid_json_args';
    throw err;
  }
}

async function main(argv) {
  let args;
  try {
    args = loadArgs(argv, process.env);
  } catch (err) {
    if (err && err.code === 'usage') {
      process.stderr.write(
        'usage: run-folder-download.js <json-args|--args-env>\n',
      );
      process.exit(2);
    }
    process.stderr.write('invalid_json_args\n');
    process.exit(2);
  }

  const bucket = args.bucket || process.env.A_AFFILIATES_BUCKET || 'a-affiliates';
  const region =
    args.region ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    'eu-west-2';

  if (args.awsProfile) {
    process.env.AWS_PROFILE = String(args.awsProfile);
  }

  // Lazy-load AWS SDK so unit tests can require folderDownloadOne without node_modules.
  const {
    S3Client,
    HeadObjectCommand,
    PutObjectCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    DeleteObjectCommand,
  } = require('@aws-sdk/client-s3');

  function wrapS3Client(client) {
    return {
      headObject: (input) => client.send(new HeadObjectCommand(input)),
      putObject: (input) => client.send(new PutObjectCommand(input)),
      getObject: (input) => client.send(new GetObjectCommand(input)),
      listObjectsV2: (input) => client.send(new ListObjectsV2Command(input)),
      deleteObject: (input) => client.send(new DeleteObjectCommand(input)),
    };
  }

  const s3 = wrapS3Client(
    new S3Client({
      region,
    }),
  );

  const result = await folderDownloadOne({
    s3,
    bucket,
    provider: args.provider,
    affiliateId: args.affiliateId,
    affiliateMeta: args.affiliateMeta,
    force: Boolean(args.force),
    dryRun: Boolean(args.dryRun),
    fetchImpl: globalThis.fetch,
    now: args.now ? new Date(args.now) : undefined,
  });

  process.stdout.write(JSON.stringify(redactResult(result)) + '\n');
  if (
    !result.ok &&
    result.status !== 'exists' &&
    result.status !== 'parts_exists' &&
    result.status !== 'skipped_nofeed'
  ) {
    process.exit(1);
  }
  process.exit(0);
}

if (require.main === module) {
  main(process.argv).catch((err) => {
    const msg = err && err.message ? String(err.message) : 'download_error';
    const safe = msg.replace(
      /(api[_-]?key|token|password|secret|feedurl)\s*[:=]\s*\S+/gi,
      '$1=***',
    );
    process.stderr.write(safe + '\n');
    process.exit(1);
  });
}

module.exports = {
  redactResult,
  main,
  loadArgs,
  ARGS_ENV,
};
