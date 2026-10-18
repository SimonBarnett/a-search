'use strict';

/**
 * FR #4098: redqueen a-clubs queue service entry (Windows service / console).
 *
 * Env:
 *   A_CLUBS_FOLDER_EVENTS_QUEUE_URL  (required)
 *   A_CLUBS_BUCKET                   (default a-clubs)
 *   AWS_REGION                       (default eu-west-2)
 *   AWS_PROFILE                      (default a-search-redqueen-annotator)
 *   REDQUEEN_POLL_MS                 (default 5000)
 *   REDQUEEN_ON_NEW_FOLDER           (optional path to .js hook module exporting onNewFolder)
 *   REDQUEEN_LOG_FILE                (optional rotating log path)
 *
 * Never logs secrets. Uses named AWS profile --- never root keys.
 */

const fs = require('node:fs');
const path = require('node:path');
const { drainOnce } = require('./drain');
const { defaultReviewHost, defaultReviewGuid } = require('./reviewers');

function logLine(obj) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...obj });
  const logFile = process.env.REDQUEEN_LOG_FILE;
  if (logFile) {
    try {
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      // Simple size rotate at ~5 MiB
      try {
        const st = fs.statSync(logFile);
        if (st.size > 5 * 1024 * 1024) {
          fs.renameSync(logFile, `${logFile}.1`);
        }
      } catch {
        // no existing log
      }
      fs.appendFileSync(logFile, `${line}\n`, 'utf8');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(JSON.stringify({ ok: false, log_error: String(err && err.message || err) }));
    }
  }
  // eslint-disable-next-line no-console
  console.log(line);
}

function loadOnNewFolderHook() {
  const hookPath = process.env.REDQUEEN_ON_NEW_FOLDER;
  if (!hookPath) return undefined;
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const mod = require(path.resolve(hookPath));
  if (typeof mod === 'function') return mod;
  if (mod && typeof mod.onNewFolder === 'function') return mod.onNewFolder;
  throw new Error(`REDQUEEN_ON_NEW_FOLDER must export onNewFolder: ${hookPath}`);
}

async function buildAwsDeps() {
  // eslint-disable-next-line global-require
  const {
    S3Client,
    HeadObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    ListObjectsV2Command,
    CopyObjectCommand,
  } = require('@aws-sdk/client-s3');
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

  // Prefer explicit profile for the annotator IAM user (never root).
  if (!process.env.AWS_PROFILE && !process.env.AWS_ACCESS_KEY_ID) {
    process.env.AWS_PROFILE = 'a-search-redqueen-annotator';
  }

  const s3 = new S3Client({ region });
  const sqs = new SQSClient({ region });

  /** PutObjectAnnotation may be missing on older SDKs --- fall back to CLI. */
  async function putObjectAnnotation(input) {
    try {
      // eslint-disable-next-line global-require
      const { PutObjectAnnotationCommand } = require('@aws-sdk/client-s3');
      return s3.send(
        new PutObjectAnnotationCommand({
          Bucket: bucket,
          Key: input.Key,
          AnnotationName: input.AnnotationName,
          AnnotationPayload: Buffer.isBuffer(input.AnnotationPayload)
            ? input.AnnotationPayload
            : Buffer.from(String(input.AnnotationPayload), 'utf8'),
        }),
      );
    } catch (err) {
      if (err && /Cannot find module|is not a constructor|PutObjectAnnotation/.test(String(err))) {
        const { spawnSync } = require('node:child_process');
        const tmp = path.join(
          require('node:os').tmpdir(),
          `a-search-ann-${process.pid}-${Date.now()}.json`,
        );
        fs.writeFileSync(tmp, input.AnnotationPayload, 'utf8');
        try {
          const r = spawnSync(
            'aws',
            [
              's3api',
              'put-object-annotation',
              '--bucket',
              bucket,
              '--key',
              input.Key,
              '--annotation-name',
              input.AnnotationName,
              '--annotation-payload',
              `fileb://${tmp}`,
              '--region',
              region,
            ],
            { encoding: 'utf8', windowsHide: true },
          );
          if (r.status !== 0) {
            throw new Error(`put-object-annotation_cli:${r.stderr || r.stdout || r.status}`);
          }
          return {};
        } finally {
          try {
            fs.unlinkSync(tmp);
          } catch {
            // ignore
          }
        }
      }
      throw err;
    }
  }

  async function getObjectAnnotation(input) {
    try {
      // eslint-disable-next-line global-require
      const { GetObjectAnnotationCommand } = require('@aws-sdk/client-s3');
      return s3.send(
        new GetObjectAnnotationCommand({
          Bucket: bucket,
          Key: input.Key,
          AnnotationName: input.AnnotationName,
        }),
      );
    } catch (err) {
      if (err && /Cannot find module|GetObjectAnnotation/.test(String(err))) {
        const { spawnSync } = require('node:child_process');
        const r = spawnSync(
          'aws',
          [
            's3api',
            'get-object-annotation',
            '--bucket',
            bucket,
            '--key',
            input.Key,
            '--annotation-name',
            input.AnnotationName,
            '--region',
            region,
          ],
          { encoding: 'utf8', windowsHide: true },
        );
        if (r.status !== 0) {
          const e = new Error('NoSuchAnnotation');
          e.name = 'NoSuchAnnotation';
          e.$metadata = { httpStatusCode: 404 };
          throw e;
        }
        return { AnnotationPayload: r.stdout, AnnotationName: input.AnnotationName };
      }
      throw err;
    }
  }

  async function listObjectAnnotations(input) {
    try {
      // eslint-disable-next-line global-require
      const { ListObjectAnnotationsCommand } = require('@aws-sdk/client-s3');
      return s3.send(
        new ListObjectAnnotationsCommand({
          Bucket: bucket,
          Key: input.Key,
        }),
      );
    } catch (err) {
      if (err && /Cannot find module|ListObjectAnnotations/.test(String(err))) {
        const { spawnSync } = require('node:child_process');
        const r = spawnSync(
          'aws',
          [
            's3api',
            'list-object-annotations',
            '--bucket',
            bucket,
            '--key',
            input.Key,
            '--region',
            region,
            '--output',
            'json',
          ],
          { encoding: 'utf8', windowsHide: true },
        );
        if (r.status !== 0) return { Annotations: [] };
        try {
          return JSON.parse(r.stdout);
        } catch {
          return { Annotations: [] };
        }
      }
      throw err;
    }
  }

  return {
    queueUrl,
    bucket,
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
    copyObject: (input) =>
      s3.send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: input.CopySource || `${bucket}/${input.Key}`,
          Key: input.Key,
          Metadata: input.Metadata,
          MetadataDirective: input.MetadataDirective || 'REPLACE',
        }),
      ),
    putObjectAnnotation,
    getObjectAnnotation,
    listObjectAnnotations,
    reviewHost: defaultReviewHost,
    reviewGuid: defaultReviewGuid,
    onNewFolder: loadOnNewFolderHook(),
  };
}

async function main() {
  const deps = await buildAwsDeps();
  const pollMs = Number(process.env.REDQUEEN_POLL_MS || 5000);
  logLine({
    ok: true,
    event: 'start',
    profile: process.env.AWS_PROFILE || '(keys)',
    bucket: process.env.A_CLUBS_BUCKET || 'a-clubs',
  });
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const result = await drainOnce(deps);
      if (result.processed > 0) {
        logLine({ ok: true, ...result });
      }
    } catch (err) {
      logLine({ ok: false, error: String(err && err.message || err) });
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

if (require.main === module) {
  main().catch((err) => {
    logLine({ ok: false, fatal: String(err && err.message || err) });
    process.exit(1);
  });
}

module.exports = { buildAwsDeps, main, loadOnNewFolderHook };
