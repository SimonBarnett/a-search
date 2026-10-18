'use strict';

/**
 * FR #3987: redqueen drain loop entry (outbound HTTPS to SQS + S3 only).
 *
 * Env:
 *   A_CLUBS_FOLDER_EVENTS_QUEUE_URL  (required)
 *   A_CLUBS_BUCKET                   (default a-clubs)
 *   AWS_REGION                       (default eu-west-2)
 *   REDQUEEN_POLL_MS                 (default 5000)
 *
 * Inject reviewHost / reviewGuid by requiring annotate.js from a wrapper.
 * This binary uses the stub reviewers until a local model CLI is wired.
 */

const { drainOnce } = require('./drain');

async function buildAwsDeps() {
  // eslint-disable-next-line global-require
  const { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } =
    require('@aws-sdk/client-s3');
  // eslint-disable-next-line global-require
  const {
    SQSClient,
    ReceiveMessageCommand,
    DeleteMessageCommand,
    ChangeMessageVisibilityCommand,
  } = require('@aws-sdk/client-sqs');

  const region =
    process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-west-2';
  const bucket = process.env.A_CLUBS_BUCKET || 'a-clubs';
  const queueUrl = process.env.A_CLUBS_FOLDER_EVENTS_QUEUE_URL;
  if (!queueUrl) {
    throw new Error('A_CLUBS_FOLDER_EVENTS_QUEUE_URL required');
  }

  const s3 = new S3Client({ region });
  const sqs = new SQSClient({ region });

  return {
    queueUrl,
    receiveMessage: (input) => sqs.send(new ReceiveMessageCommand(input)),
    deleteMessage: (input) => sqs.send(new DeleteMessageCommand(input)),
    changeMessageVisibility: (input) =>
      sqs.send(new ChangeMessageVisibilityCommand(input)),
    headObject: (input) =>
      s3.send(new HeadObjectCommand({ Bucket: bucket, ...input })),
    getObject: (input) =>
      s3.send(new GetObjectCommand({ Bucket: bucket, ...input })),
    putObject: (input) =>
      s3.send(new PutObjectCommand({ Bucket: bucket, ...input })),
    listObjectsV2: (input) =>
      s3.send(new ListObjectsV2Command({ Bucket: bucket, ...input })),
  };
}

async function main() {
  const deps = await buildAwsDeps();
  const pollMs = Number(process.env.REDQUEEN_POLL_MS || 5000);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const result = await drainOnce(deps);
      if (result.processed > 0) {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({ ok: true, ...result }));
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(JSON.stringify({ ok: false, error: String(err && err.message || err) }));
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}

module.exports = { buildAwsDeps, main };
