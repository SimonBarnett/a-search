'use strict';

/**
 * FR #4918: redqueen hasresults monitor service entry.
 *
 * Env:
 *   A_CLUBS_BUCKET              (default a-clubs)
 *   A_CLUBS_ROOT                (optional mapped root for agent cwd)
 *   AWS_REGION                  (default eu-west-2)
 *   AWS_PROFILE                 (default a-search-redqueen-annotator)
 *   HASRESULTS_MONITOR_MS       (poll interval; default REDQUEEN_SWEEP_MS or 900000)
 *   HASRESULTS_MONITOR_MAX_RETRIES (default 5)
 *   HASRESULTS_MONITOR_LOCK_DIR
 *   HASRESULTS_MONITOR_LOG_FILE
 *   A_SEARCH_GROK_BIN / optional Cursor launch hooks via inject in tests
 *
 * Never logs secrets. Missing AWS credentials: warn and keep running (empty pass).
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  runHasresultsMonitorPass,
  DEFAULT_MAX_RETRIES,
} = require('./hasresultsMonitor');

const DEFAULT_MS = 900000;

function logLine(obj) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...obj });
  const logFile =
    process.env.HASRESULTS_MONITOR_LOG_FILE || process.env.REDQUEEN_LOG_FILE;
  if (logFile) {
    try {
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
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
      console.error(
        JSON.stringify({
          ok: false,
          log_error: String((err && err.message) || err),
        }),
      );
    }
  }
  // eslint-disable-next-line no-console
  console.log(line);
}

async function buildAwsDeps() {
  // eslint-disable-next-line global-require
  const {
    S3Client,
    HeadObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command,
    CopyObjectCommand,
  } = require('@aws-sdk/client-s3');

  const region =
    process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-west-2';
  const bucket = process.env.A_CLUBS_BUCKET || 'a-clubs';

  if (!process.env.AWS_PROFILE && !process.env.AWS_ACCESS_KEY_ID) {
    process.env.AWS_PROFILE = 'a-search-redqueen-annotator';
  }

  const s3 = new S3Client({ region, maxAttempts: 5 });

  return {
    bucket,
    region,
    listObjectsV2: (input) =>
      s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ...input,
        }),
      ),
    headObject: (input) =>
      s3.send(new HeadObjectCommand({ Bucket: bucket, ...input })),
    getObject: (input) =>
      s3.send(new GetObjectCommand({ Bucket: bucket, ...input })),
    putObject: (input) =>
      s3.send(new PutObjectCommand({ Bucket: bucket, ...input })),
    deleteObject: (input) =>
      s3.send(new DeleteObjectCommand({ Bucket: bucket, ...input })),
    copyObject: (input) =>
      s3.send(new CopyObjectCommand({ Bucket: bucket, ...input })),
  };
}

async function main(opts = {}) {
  const version = (() => {
    try {
      return require('../../package.json').version || '0.1.0';
    } catch {
      return '0.1.0';
    }
  })();

  if (process.argv.indexOf('--version') !== -1) {
    process.stdout.write(`a-hasresults-monitor ${version}\n`);
    return;
  }

  const intervalMs = Number(
    opts.intervalMs != null
      ? opts.intervalMs
      : process.env.HASRESULTS_MONITOR_MS ||
          process.env.REDQUEEN_SWEEP_MS ||
          DEFAULT_MS,
  );
  const maxRetries = Number(
    opts.maxRetries != null
      ? opts.maxRetries
      : process.env.HASRESULTS_MONITOR_MAX_RETRIES || DEFAULT_MAX_RETRIES,
  );
  const aClubsRoot =
    opts.aClubsRoot != null
      ? String(opts.aClubsRoot)
      : String(process.env.A_CLUBS_ROOT || '').trim();
  const lockDir =
    opts.lockDir ||
    process.env.HASRESULTS_MONITOR_LOCK_DIR ||
    path.join(
      process.env.TEMP || process.env.TMP || '/tmp',
      'a-search-hasresults-locks',
    );
  const selfEtags = opts.selfEtags || new Map();
  const retryCounts = opts.retryCounts || new Map();

  logLine({
    ok: true,
    event: 'hasresults_monitor_start',
    intervalMs,
    maxRetries,
    aClubsRoot: aClubsRoot || null,
  });

  async function onePass() {
    let deps;
    try {
      deps =
        typeof opts.buildAwsDeps === 'function'
          ? await opts.buildAwsDeps()
          : await buildAwsDeps();
    } catch (err) {
      logLine({
        ok: false,
        event: 'hasresults_monitor_aws_warn',
        error: String((err && err.message) || err),
      });
      return { scanned: 0, actions: [], warning: 'aws_unavailable' };
    }

    return runHasresultsMonitorPass({
      ...deps,
      aClubsRoot,
      lockDir,
      maxRetries,
      selfEtags,
      retryCounts,
      log: (row) => logLine(row),
    });
  }

  if (opts.once) {
    return onePass();
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const result = await onePass();
      logLine({
        ok: true,
        event: 'hasresults_monitor_pass',
        scanned: result.scanned,
        actions: (result.actions || []).length,
      });
    } catch (err) {
      logLine({
        ok: false,
        event: 'hasresults_monitor_pass_error',
        error: String((err && err.message) || err),
      });
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

module.exports = {
  main,
  buildAwsDeps,
  DEFAULT_MS,
};

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(String((err && err.message) || err));
    process.exit(1);
  });
}
