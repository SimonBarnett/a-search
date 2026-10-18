'use strict';

/**
 * FR #4008: Lambda entries for weekly dual-bucket download and onCreated.
 */

const { S3Client } = require('@aws-sdk/client-s3');
const {
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { runWeekly } = require('./runWeekly');
const { onCreated } = require('./onCreated');

const DEFAULT_MERCHANTS_BUCKET = 'a-merchants';

/**
 * Thin SDK wrapper matching memoryS3 method names.
 * @param {S3Client} client
 */
function wrapS3Client(client) {
  return {
    headObject: (input) => client.send(new HeadObjectCommand(input)),
    putObject: (input) => client.send(new PutObjectCommand(input)),
    getObject: (input) => client.send(new GetObjectCommand(input)),
    listObjectsV2: (input) => client.send(new ListObjectsV2Command(input)),
    deleteObject: (input) => client.send(new DeleteObjectCommand(input)),
  };
}

/**
 * @param {{ s3?: object }} [deps]
 */
function resolveS3(deps) {
  if (deps && deps.s3) return deps.s3;
  return wrapS3Client(
    new S3Client({
      region:
        process.env.AWS_REGION ||
        process.env.AWS_DEFAULT_REGION ||
        'eu-west-2',
    }),
  );
}

/**
 * Daily EventBridge entry (FR #4269): downloads enabled=1 + lastdownload stale
 * across a-merchants and optional a-affiliates (A_AFFILIATES_BUCKET).
 */
async function handler(event, context, deps) {
  const merchantsBucket =
    (deps && deps.merchantsBucket) ||
    process.env.A_MERCHANTS_BUCKET ||
    DEFAULT_MERCHANTS_BUCKET;
  const affiliatesBucket =
    (deps && deps.affiliatesBucket) ||
    process.env.A_AFFILIATES_BUCKET ||
    '';

  const s3 = resolveS3(deps);
  const summary = await runWeekly({
    s3,
    merchantsBucket,
    affiliatesBucket: affiliatesBucket || undefined,
    fetchImpl: deps && deps.fetchImpl,
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      merchantsBucket,
      affiliatesBucket: affiliatesBucket || null,
      merchants: {
        providers: summary.merchants.providers,
        merchants: summary.merchants.merchants,
        ok: summary.merchants.ok,
        failed: summary.merchants.failed,
      },
      affiliates: {
        providers: summary.affiliates.providers,
        affiliates: summary.affiliates.affiliates,
        ok: summary.affiliates.ok,
        failed: summary.affiliates.failed,
      },
    }),
  };
}

/**
 * S3 ObjectCreated entry (merchant markers; affiliates if wired).
 */
async function onCreatedHandler(event, context, deps) {
  const s3 = resolveS3(deps);
  const result = await onCreated(event, {
    s3,
    bucket:
      (deps && deps.bucket) ||
      process.env.A_MERCHANTS_BUCKET ||
      DEFAULT_MERCHANTS_BUCKET,
    affiliatesBucket:
      (deps && deps.affiliatesBucket) || process.env.A_AFFILIATES_BUCKET || '',
    fetchImpl: deps && deps.fetchImpl,
  });
  return {
    statusCode: 200,
    body: JSON.stringify(result),
  };
}

module.exports = {
  handler,
  onCreatedHandler,
  wrapS3Client,
  DEFAULT_MERCHANTS_BUCKET,
};
