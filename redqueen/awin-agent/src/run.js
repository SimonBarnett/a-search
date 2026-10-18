'use strict';

/**
 * FR #4123: daily Awin onboarding agent entry (redqueen).
 *
 * Runtime order on the box: Grok first, Cursor fallback (ops / Task Scheduler).
 * This process: lock → optional sign-in → invite/join (injected) → folder upserts
 * → report. -DryRun makes no Awin side effects and no S3 writes.
 */

const fs = require('node:fs');
const path = require('node:path');
const { acquireAwinAgentLock } = require('./lock');
const {
  readAwinSecretFile,
  writePasswordTemp,
  assertNoSecrets,
  redactSecrets,
} = require('./secrets');
const { resolveDailyLimits, takeUpTo } = require('./limits');
const { buildDailyReport, writeDailyReportFile } = require('./report');
const {
  upsertAwinAffiliateFolder,
  markNoFeedFollowUp,
} = require('./folderUpsert');
const { signInPublisher } = require('./session');

const DEFAULT_LOCK =
  process.env.AWIN_AGENT_LOCK ||
  path.join(
    process.env.ProgramData || 'C:\\ProgramData',
    'a-search',
    'awin-agent.lock',
  );
const DEFAULT_REPORT_DIR =
  process.env.AWIN_AGENT_REPORT_DIR ||
  path.join('C:', 'ai', 'a-search', 'logs', 'awin-agent');

/**
 * @param {{
 *   dryRun?: boolean,
 *   now?: Date,
 *   lockPath?: string,
 *   reportDir?: string,
 *   bucket?: string,
 *   s3?: object,
 *   browser?: object,
 *   secretPath?: string,
 *   secretIo?: object,
 *   maxInvites?: number,
 *   maxJoins?: number,
 *   plan?: {
 *     inviteIds?: string[],
 *     joinIds?: string[],
 *     approved?: Array<{ id: string, name?: string, feedurl?: string, feedid?: string, feedapikeyPlaceholder?: string }>,
 *     noFeedIds?: string[],
 *   },
 *   awin?: {
 *     invite?: Function,
 *     join?: Function,
 *   },
 *   skipSignIn?: boolean,
 *   stdoutWrite?: Function,
 * }} opts
 */
async function runAwinAgent(opts = {}) {
  const now = opts.now || new Date();
  const day = now.toISOString().slice(0, 10);
  const dryRun = Boolean(opts.dryRun);
  const lockPath = opts.lockPath || DEFAULT_LOCK;
  const reportDir = opts.reportDir || DEFAULT_REPORT_DIR;
  const bucket = opts.bucket || process.env.A_AFFILIATES_BUCKET || 'a-affiliates';
  const limits = resolveDailyLimits(opts);
  const plan = opts.plan || {};
  const secretsHeld = [];

  const lock = acquireAwinAgentLock(lockPath, {
    now: () => now.getTime(),
  });
  if (!lock.ok) {
    const report = buildDailyReport({
      day,
      dryRun,
      alreadyRunning: true,
    });
    const line = JSON.stringify(report);
    (opts.stdoutWrite || process.stdout.write.bind(process.stdout))(`${line}\n`);
    return { ok: true, code: 'already_running', report };
  }

  let passwordTemp = null;
  const invited = [];
  const joined = [];
  const approved = [];
  const foldersCreated = [];
  const foldersUpdated = [];
  const noFeedFollowUps = [];
  const notifySimon = [];

  try {
    if (!opts.skipSignIn) {
      const creds = readAwinSecretFile(opts.secretPath, opts.secretIo);
      secretsHeld.push(creds.password, creds.email);
      passwordTemp = writePasswordTemp(creds.password);
      if (opts.browser) {
        const signed = await signInPublisher({
          browser: opts.browser,
          email: creds.email,
          passwordTempPath: passwordTemp,
        });
        if (!signed.ok) {
          notifySimon.push(
            `signin:${signed.code}:${signed.detail || ''}`.slice(0, 200),
          );
          // OTP / captcha: stop; do not loop. Still write report.
          const report = finishReport();
          return {
            ok: false,
            code: signed.code,
            report,
            notifySimon: report.notifySimon,
          };
        }
      }
    }

    const inviteIds = takeUpTo(plan.inviteIds || [], limits.maxInvites);
    const joinIds = takeUpTo(plan.joinIds || [], limits.maxJoins);

    for (const id of inviteIds) {
      if (!dryRun && opts.awin && typeof opts.awin.invite === 'function') {
        await opts.awin.invite(id);
      }
      invited.push(String(id));
    }
    for (const id of joinIds) {
      if (!dryRun && opts.awin && typeof opts.awin.join === 'function') {
        await opts.awin.join(id);
      }
      joined.push(String(id));
    }

    for (const row of plan.approved || []) {
      const id = String(row.id);
      approved.push(id);
      const feedurl = row.feedurl
        ? String(row.feedurl)
        : row.feedapikeyPlaceholder
          ? `https://productdata.awin.com/datafeed/download/apikey/{feedapikey}/fid/${row.feedid || id}`
          : '';
      const patch = {
        name: row.name || id,
        awinmid: id,
        enabled: feedurl || row.feedid ? '1' : '0',
        ...(row.feedid ? { feedid: String(row.feedid) } : {}),
        ...(feedurl ? { feedurl } : { disabledreason: 'nofeed', laststatus: 'missing_feedurl' }),
        format: 'csv',
        compression: 'gzip',
        schedule: 'weekly',
      };
      if (!opts.s3) continue;
      const result = await upsertAwinAffiliateFolder({
        s3: opts.s3,
        bucket,
        advertiserId: id,
        patch,
        now,
        dryRun,
      });
      if (result.action === 'created' || result.action === 'would_create') {
        foldersCreated.push(id);
      } else {
        foldersUpdated.push(id);
      }
      assertNoSecrets(result.metadata, secretsHeld);
    }

    for (const id of plan.noFeedIds || []) {
      if (!opts.s3) {
        noFeedFollowUps.push(String(id));
        continue;
      }
      const result = await markNoFeedFollowUp({
        s3: opts.s3,
        bucket,
        advertiserId: id,
        now,
        dryRun,
        patch: { name: String(id) },
      });
      noFeedFollowUps.push(String(id));
      if (result.action === 'created' || result.action === 'would_create') {
        foldersCreated.push(String(id));
      } else {
        foldersUpdated.push(String(id));
      }
      assertNoSecrets(result.metadata, secretsHeld);
    }

    const report = finishReport();
    return { ok: true, code: dryRun ? 'dry_run' : 'ok', report };
  } finally {
    if (passwordTemp) {
      try {
        fs.unlinkSync(passwordTemp);
        fs.rmdirSync(path.dirname(passwordTemp));
      } catch {
        // ignore
      }
    }
    lock.release();
  }

  function finishReport() {
    const report = buildDailyReport({
      day,
      dryRun,
      invited,
      joined,
      approved,
      foldersCreated,
      foldersUpdated,
      noFeedFollowUps,
      notifySimon,
    });
    const text = JSON.stringify(report);
    const safe = redactSecrets(text, secretsHeld);
    assertNoSecrets(safe, secretsHeld);
    if (!dryRun) {
      writeDailyReportFile(report, reportDir);
    }
    (opts.stdoutWrite || process.stdout.write.bind(process.stdout))(`${safe}\n`);
    return report;
  }
}

function parseArgs(argv) {
  const out = { dryRun: false };
  for (const a of argv || []) {
    if (a === '-DryRun' || a === '--dry-run') out.dryRun = true;
  }
  return out;
}

async function main(argv = process.argv.slice(2)) {
  const flags = parseArgs(argv);
  const result = await runAwinAgent({ dryRun: flags.dryRun });
  if (result.code === 'already_running') {
    process.exitCode = 0;
    return;
  }
  if (!result.ok) {
    process.exitCode = 2;
  }
}

module.exports = {
  runAwinAgent,
  parseArgs,
  main,
  DEFAULT_LOCK,
  DEFAULT_REPORT_DIR,
};

if (require.main === module) {
  main().catch((err) => {
    const msg = JSON.stringify({
      ok: false,
      error: String((err && err.code) || (err && err.message) || err),
    });
    process.stderr.write(`${msg}\n`);
    process.exitCode = 1;
  });
}
