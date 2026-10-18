'use strict';

/**
 * FR #4108: Node entry for tools/download --- calls folderDownloadOne (downloadOne).
 * Usage: node tools/run-folder-download.js <json-args>
 * JSON: { provider, affiliateId, bucket, force?, dryRun?, affiliateMeta?, awsProfile?, region? }
 * Prints one JSON line to stdout (no secrets / no feedurl value).
 */

const {
  folderDownloadOne,
  redactResult,
} = require('../affiliates/src/folderDownloadOne');

async function main(argv) {
  const raw = argv[2] || '';
  if (!raw) {
    process.stderr.write('usage: run-folder-download.js <json-args>\n');
    process.exit(2);
  }
  let args;
  try {
    args = JSON.parse(raw);
  } catch {
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
  if (!result.ok && result.status !== 'parts_exists') {
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
};
