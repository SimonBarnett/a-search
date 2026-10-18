'use strict';

/**
 * FR #3999 / #4195: Lambda entry for daily a-affiliates feed download
 * (7-day refresh; EventBridge rate 1 day).
 */

const { S3Client } = require('@aws-sdk/client-s3');
const {
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { runDaily } = require('./runDaily');

const DEFAULT_BUCKET = 'a-affiliates';

/**
 * Thin SDK wrapper matching memoryS3 method names used by runWeekly/downloadOne.
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
 * @param {object} [event]
 * @param {object} [context]
 * @param {{ s3?: object, bucket?: string, fetchImpl?: Function }} [deps]
 */
async function handler(event, context, deps) {
  const bucket =
    (deps && deps.bucket) ||
    process.env.A_AFFILIATES_BUCKET ||
    DEFAULT_BUCKET;

  const s3 =
    (deps && deps.s3) ||
    wrapS3Client(
      new S3Client({
        region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-west-2',
      }),
    );

  const summary = await runDaily({
    s3,
    bucket,
    fetchImpl: deps && deps.fetchImpl,
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      bucket,
      providers: summary.providers,
      affiliates: summary.affiliates,
      ok: summary.ok,
      failed: summary.failed,
    }),
  };
}

module.exports = {
  handler,
  wrapS3Client,
  DEFAULT_BUCKET,
};
