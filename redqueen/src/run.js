'use strict';

/**
 * FR #4098: redqueen a-clubs queue service entry (Windows service / console).
 *
 * Env:
 *   A_CLUBS_FOLDER_EVENTS_QUEUE_URL  (required)
 *   A_CLUBS_CHANGES_QUEUE_URL        (optional second long-poll: EventBridge a-clubs-changes)
 *   A_CLUBS_BUCKET                   (default a-clubs)
 *   AWS_REGION                       (default eu-west-2)
 *   AWS_PROFILE                      (default a-search-redqueen-annotator)
 *   REDQUEEN_POLL_MS                 (error backoff only; default 5000. Empty long-poll does not sleep)
 *   REDQUEEN_SWEEP_MS                (stale-marker sweep; default 900000)
 *   REDQUEEN_ON_NEW_FOLDER           (optional path to .js hook module exporting onNewFolder)
 *   REDQUEEN_LOG_FILE                (optional rotating log path)
 *   REDQUEEN_REANNOTATE              (1/true/yes: rewrite markers even when already annotated)
 *   A_SEARCH_API_URL                 (POST /search base; required for GUID search)
 *   A_SEARCH_AGENT_API_KEY           (or A_SEARCH_AGENT_API_KEY_FILE; never logged)
 *
 * Never logs secrets. Uses named AWS profile --- never root keys.
 */

const fs = require('node:fs');
const path = require('node:path');
const { drainDual } = require('./drain');
const { defaultReviewHost, defaultReviewGuid } = require('./reviewers');
const { createHttpPostSearch } = require('./guidSearch');
const { runStaleSweep } = require('./staleSweep');

const DEFAULT_SWEEP_MS = 900000;

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

  const s3 = new S3Client({ region, maxAttempts: 5 });
  const sqs = new SQSClient({ region, maxAttempts: 5 });
  const selfEtags = new Map();
  const changesQueueUrl = process.env.A_CLUBS_CHANGES_QUEUE_URL || '';

  function noteEtag(key, etag) {
    if (!key || !etag) return;
    selfEtags.set(
      String(key),
      String(etag).replace(/^W\//i, '').replace(/"/g, '').trim().toLowerCase(),
    );
  }

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
    changesQueueUrl,
    bucket,
    selfEtags,
    receiveMessage: (input) => sqs.send(new ReceiveMessageCommand(input)),
    deleteMessage: (input) => sqs.send(new DeleteMessageCommand(input)),
    changeMessageVisibility: (input) =>
      sqs.send(new ChangeMessageVisibilityCommand(input)),
    headObject: (input) =>
      s3.send(new HeadObjectCommand({ Bucket: bucket, ...input })),
    getObject: (input) =>
      s3.send(new GetObjectCommand({ Bucket: bucket, ...input })),
    putObject: async (input) => {
      const resp = await s3.send(new PutObjectCommand({ Bucket: bucket, ...input }));
      noteEtag(input && input.Key, resp && resp.ETag);
      return resp;
    },
    listObjectsV2: (input) =>
      s3.send(new ListObjectsV2Command({ Bucket: bucket, ...input })),
    copyObject: async (input) => {
      const resp = await s3.send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: input.CopySource || `${bucket}/${input.Key}`,
          Key: input.Key,
          Metadata: input.Metadata,
          MetadataDirective: input.MetadataDirective || 'REPLACE',
        }),
      );
      const etag = resp && ((resp.CopyObjectResult && resp.CopyObjectResult.ETag) || resp.ETag);
      noteEtag(input && input.Key, etag);
      return resp;
    },
    putObjectAnnotation,
    getObjectAnnotation,
    listObjectAnnotations,
    reviewHost: defaultReviewHost,
    reviewGuid: defaultReviewGuid,
    postSearch: createHttpPostSearch(process.env),
    reannotate: /^(1|true|yes)$/i.test(String(process.env.REDQUEEN_REANNOTATE || '')),
    onNewFolder: loadOnNewFolderHook(),
  };
}

/**
 * Startup sweep, then dual long-poll. No extra sleep after an empty receive.
 * REDQUEEN_POLL_MS is only the backoff after a thrown error.
 * @param {object} deps
 * @param {{
 *   drain?: Function,
 *   sweep?: Function,
 *   sleep?: (ms: number) => Promise<void>,
 *   now?: () => number,
 *   sweepMs?: number,
 *   errorSleepMs?: number,
 *   maxLoops?: number,
 *   log?: (obj: object) => void,
 * }} [hooks]
 */
async function serviceLoop(deps, hooks) {
  const h = hooks || {};
  const drain = h.drain || drainDual;
  const sweep = h.sweep || runStaleSweep;
  const sleep = h.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = h.now || Date.now;
  const sweepMs = h.sweepMs != null
    ? Number(h.sweepMs)
    : Number(process.env.REDQUEEN_SWEEP_MS || DEFAULT_SWEEP_MS);
  const errorSleepMs = h.errorSleepMs != null
    ? Number(h.errorSleepMs)
    : Number(process.env.REDQUEEN_POLL_MS || 5000);
  const log = h.log || logLine;
  const maxLoops = h.maxLoops;

  try {
    await sweep(deps);
  } catch (err) {
    log({ ok: false, event: 'sweep', error: String((err && err.message) || err) });
  }
  let lastSweep = now();
  let i = 0;
  while (maxLoops == null || i < maxLoops) {
    i += 1;
    try {
      const result = await drain(deps);
      if (result && result.processed > 0) log({ ok: true, ...result });
    } catch (err) {
      log({ ok: false, error: String((err && err.message) || err) });
      await sleep(errorSleepMs);
      continue;
    }
    if (now() - lastSweep >= sweepMs) {
      try {
        await sweep(deps);
      } catch (err) {
        log({ ok: false, event: 'sweep', error: String((err && err.message) || err) });
      }
      lastSweep = now();
    }
  }
  return { loops: i };
}

async function main() {
  const deps = await buildAwsDeps();
  logLine({
    ok: true,
    event: 'start',
    profile: process.env.AWS_PROFILE || '(keys)',
    bucket: process.env.A_CLUBS_BUCKET || 'a-clubs',
    changesQueue: Boolean(deps.changesQueueUrl),
    sweepMs: Number(process.env.REDQUEEN_SWEEP_MS || DEFAULT_SWEEP_MS),
    searchConfigured: Boolean(
      process.env.A_SEARCH_API_URL &&
        (process.env.A_SEARCH_AGENT_API_KEY || process.env.A_SEARCH_AGENT_API_KEY_FILE),
    ),
  });
  await serviceLoop(deps, { log: logLine });
}

function annotatorVersion() {
  try {
    return require('../../package.json').version || '0.1.0';
  } catch {
    return '0.1.0';
  }
}

if (require.main === module) {
  if (process.argv.indexOf('--version') !== -1) {
    process.stdout.write(`a-annotator ${annotatorVersion()}\n`);
    process.exit(0);
  }
  main().catch((err) => {
    logLine({ ok: false, fatal: String(err && err.message || err) });
    process.exit(1);
  });
}

module.exports = {
  buildAwsDeps,
  main,
  loadOnNewFolderHook,
  serviceLoop,
  annotatorVersion,
  DEFAULT_SWEEP_MS,
};
