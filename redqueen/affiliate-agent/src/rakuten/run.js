'use strict';

/**
 * FR #4701: daily Rakuten signup agent --- applications/approvals only (no SQL feeds).
 */

const fs = require('node:fs');
const path = require('node:path');
const { acquireAwinAgentLock } = require('../../../awin-agent/src/lock');
const { loadAffiliateAgentDocs, parseMessageCharLimit } = require('../docs');
const {
  readRakutenSecretFile,
  writePasswordTemp,
  assertNoSecrets,
  redactSecrets,
} = require('./secrets');
const { signInPublisher } = require('./session');
const {
  MERC_MANUAL_APPLICATIONS,
  mercRecord,
} = require('./mercImport');
const {
  importMercApplications,
  writeApplicationRecord,
  listApplicationRecords,
} = require('./records');
const { canReapply } = require('./dedupe');
const { sortByPriority } = require('./priority');
const { buildApplicationMessage } = require('./message');
const { buildRakutenReport, writeDailyReportFile } = require('./report');
const { runRakutenInvite } = require('../../../invite/rakutenInvite');

const DEFAULT_LOCK =
  process.env.RAKUTEN_AGENT_LOCK ||
  path.join(
    process.env.ProgramData || 'C:\\ProgramData',
    'a-search',
    'rakuten-agent.lock',
  );
const DEFAULT_REPORT_DIR =
  process.env.RAKUTEN_AGENT_REPORT_DIR ||
  path.join('C:', 'ai', 'a-search', 'logs', 'rakuten-agent');
const DEFAULT_MAX =
  Number(process.env.RAKUTEN_AGENT_MAX_APPLICATIONS || 20) || 20;

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
 *   affiliatesRoot: string,
 *   providerRoot: string,
 *   maxApplications?: number,
 *   plan?: { candidates?: Array<object>, statusChecks?: Array<object> },
 *   rakuten?: { apply?: Function, checkStatus?: Function },
 *   skipSignIn?: boolean,
 *   skipDocs?: boolean,
 *   docs?: object,
 *   stdoutWrite?: Function,
 *   crashAfterApplications?: number,
 * }} opts
 */
async function runRakutenAgent(opts = {}) {
  const now = opts.now || new Date();
  const day = now.toISOString().slice(0, 10);
  const dryRun = Boolean(opts.dryRun);
  const lockPath = opts.lockPath || DEFAULT_LOCK;
  const reportDir = opts.reportDir || DEFAULT_REPORT_DIR;
  const bucket = opts.bucket || process.env.A_AFFILIATES_BUCKET || 'a-affiliates';
  const maxApplications =
    opts.maxApplications != null ? Number(opts.maxApplications) : DEFAULT_MAX;
  const secretsHeld = [];

  const lock = acquireAwinAgentLock(lockPath, {
    now: () => now.getTime(),
  });
  if (!lock.ok) {
    const report = buildRakutenReport({
      day,
      dryRun,
      alreadyRunning: true,
    });
    (opts.stdoutWrite || process.stdout.write.bind(process.stdout))(
      `${JSON.stringify(report)}\n`,
    );
    return { ok: true, code: 'already_running', report };
  }

  let passwordTemp = null;
  const applied = [];
  const skipped = [];
  const pending = [];
  const approved = [];
  const declined = [];
  const partnershipsLive = [];
  const notifySimon = [];
  const skillsAdded = [];
  /** @type {Set<string>} */
  const notifiedApprovals = new Set();

  try {
    const useInviteBackend =
      opts.useInviteBackend === true ||
      process.env.RAKUTEN_USE_INVITE === '1' ||
      typeof opts.httpJson === 'function' ||
      typeof opts.fetchToken === 'function';
    if (
      useInviteBackend &&
      !opts.plan &&
      !opts.rakuten &&
      !opts.skipInviteBackend
    ) {
      return runRakutenInvite({
        dryRun,
        live: !dryRun,
        max: maxApplications,
        now,
        env: opts.env || process.env,
        httpJson: opts.httpJson,
        fetchToken: opts.fetchToken,
        apply: opts.apply,
        writeInviteRecord: opts.writeInviteRecord,
        reportDir:
          opts.inviteReportDir ||
          path.join('C:', 'ai', 'a-search', 'logs', 'rakuten-invite'),
        agentMd:
          opts.docs && opts.docs.texts && opts.docs.texts.providerAgent
            ? opts.docs.texts.providerAgent
            : '',
        inviteIds: opts.inviteIds,
        invitedAt: opts.invitedAt,
      });
    }
    let docs = opts.docs;
    if (!opts.skipDocs) {
      const loaded = loadAffiliateAgentDocs({
        affiliatesRoot: opts.affiliatesRoot,
        provider: 'rakuten',
        providerRoot: opts.providerRoot,
      });
      if (!loaded.ok) {
        const report = finishReport();
        return {
          ok: false,
          code: loaded.code,
          path: loaded.path,
          report,
        };
      }
      docs = loaded;
    }
    const charLimit = parseMessageCharLimit(
      (docs && docs.texts && docs.texts.providerAgent) || '',
      500,
    );

    if (!opts.skipSignIn) {
      const creds = readRakutenSecretFile(opts.secretPath, opts.secretIo);
      secretsHeld.push(creds.password, creds.email);
      passwordTemp = writePasswordTemp(creds.password);
      if (opts.browser) {
        const signed = await signInPublisher({
          browser: opts.browser,
          email: creds.email,
          passwordTempPath: passwordTemp,
          publisherId: '4766177',
        });
        if (!signed.ok) {
          notifySimon.push(
            `signin:${signed.code}:${signed.detail || ''}`.slice(0, 200),
          );
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

    if (opts.s3) {
      const mercRows = MERC_MANUAL_APPLICATIONS.map(mercRecord);
      await importMercApplications({
        s3: opts.s3,
        bucket,
        dryRun,
        mercRows,
      });
    }

    // Status checks (Pending -> Approved/Declined)
    const checks = (opts.plan && opts.plan.statusChecks) || [];
    for (const row of checks) {
      const mid = String(row.mid || row.id || '');
      const name = String(row.name || mid);
      const prev = String(row.previousStatus || 'pending').toLowerCase();
      let next = String(row.status || '').toLowerCase();
      if (
        !dryRun &&
        opts.rakuten &&
        typeof opts.rakuten.checkStatus === 'function'
      ) {
        const live = await opts.rakuten.checkStatus(mid);
        if (live && live.status) next = String(live.status).toLowerCase();
      }
      if (next === 'approved') {
        approved.push(mid || name);
        if (prev === 'pending' && !notifiedApprovals.has(mid || name)) {
          notifiedApprovals.add(mid || name);
          partnershipsLive.push(mid || name);
          const msg =
            `Rakuten partnership live: ${name}` +
            (mid ? ` (MID ${mid})` : '') +
            '. /search can be rerun for MMFC now that Rakuten can return matches.';
          notifySimon.push(msg);
        }
        if (opts.s3) {
          await writeApplicationRecord({
            s3: opts.s3,
            bucket,
            dryRun,
            record: {
              mid,
              name,
              status: 'approved',
              approvedat: now.toISOString(),
              lastchecked: now.toISOString(),
              source: row.source || 'agent',
            },
          });
        }
      } else if (next === 'declined') {
        declined.push(mid || name);
        if (opts.s3) {
          await writeApplicationRecord({
            s3: opts.s3,
            bucket,
            dryRun,
            record: {
              mid,
              name,
              status: 'declined',
              lastchecked: now.toISOString(),
              source: row.source || 'agent',
            },
          });
        }
      } else {
        pending.push(mid || name);
      }
    }

    // Existing records for dedupe
    const existingMeta = [];
    if (opts.s3) {
      const listed = await listApplicationRecords({ s3: opts.s3, bucket });
      for (const row of listed) {
        existingMeta.push(row.metadata || {});
      }
    }

    const candidates = sortByPriority(
      (opts.plan && opts.plan.candidates) || [],
    );
    let appliedCount = 0;
    for (const cand of candidates) {
      if (appliedCount >= maxApplications) break;
      const mid = String(cand.mid || cand.id || '').trim();
      const name = String(cand.name || mid);
      const prior =
        existingMeta.find(
          (m) =>
            (mid && String(m.mid) === mid) ||
            (m.name && String(m.name).toLowerCase() === name.toLowerCase()),
        ) || cand.existing;
      if (prior) {
        const gate = canReapply(prior, now);
        if (!gate.eligible) {
          skipped.push(mid || name);
          continue;
        }
      }
      const msg = buildApplicationMessage({ name, mid }, charLimit);
      if (!msg.ok) {
        skipped.push(mid || name);
        continue;
      }
      if (
        !dryRun &&
        opts.rakuten &&
        typeof opts.rakuten.apply === 'function'
      ) {
        await opts.rakuten.apply({ mid, name, message: msg.message });
      }
      const record = {
        mid,
        name,
        status: 'pending',
        appliedat: now.toISOString(),
        firstappliedat: now.toISOString(),
        applycount: '1',
        source: 'agent',
        message: msg.message.slice(0, 200),
      };
      if (opts.s3) {
        await writeApplicationRecord({
          s3: opts.s3,
          bucket,
          dryRun,
          record,
        });
        existingMeta.push(record);
      }
      applied.push(mid || name);
      appliedCount += 1;
      if (
        opts.crashAfterApplications != null &&
        appliedCount >= Number(opts.crashAfterApplications)
      ) {
        const err = new Error('simulated_crash');
        err.code = 'simulated_crash';
        throw err;
      }
    }

    const report = finishReport();
    return { ok: true, code: dryRun ? 'dry_run' : 'ok', report };
  } catch (err) {
    if (err && err.code === 'simulated_crash') {
      const report = finishReport();
      return { ok: false, code: 'simulated_crash', report };
    }
    throw err;
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
    const report = buildRakutenReport({
      day,
      dryRun,
      applied,
      skipped,
      pending,
      approved,
      declined,
      partnershipsLive,
      notifySimon,
      skillsAdded,
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

module.exports = {
  runRakutenAgent,
  DEFAULT_LOCK,
  DEFAULT_REPORT_DIR,
};
