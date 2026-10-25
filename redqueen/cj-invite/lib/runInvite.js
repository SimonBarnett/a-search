'use strict';

/**
 * FR #5066: CJ invite run — Advertiser Lookup discovery + dry-run / live apply hook.
 * Account inactive (#5057): 403 => cj_account_not_active, no records, no token print.
 * Apply step is UI-only (Account Manager); live apply is injectable for tests.
 */

import fs from 'fs';
import path from 'path';
import {
  craftInviteMessage,
  uniqueInviteMessage,
  loadInviteIndex,
  classifySkip,
  isJunkName,
  writeInviteMarkerAws,
  acquireLock,
  releaseLock,
  DEFAULT_COOLDOWN_DAYS,
} from '../../awin-agent/scripts/lib/invite-core.mjs';
import {
  listAdvertisers,
  filterByRelationship,
  CjAccountNotActiveError,
} from './advertiserLookup.js';
import { rankCjAdvertisers } from './rank.js';
import { loadCjSecretFile, redactSecrets } from './secrets.js';

/** CJ application message budget (document in AGENT.md). Longer than Awin 149. */
export const CJ_MAX_MSG = 500;

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_NEEDS_OTP = 2;
export const EXIT_ACCOUNT_NOT_ACTIVE = 5;

/**
 * @param {object} candidate
 * @param {Set<string>} used
 */
export function craftCjInviteMessage(candidate, used) {
  const msg = uniqueInviteMessage(
    {
      id: candidate.id,
      name: candidate.name,
      sector: candidate.primaryCategory || candidate.sector,
      hasFeed: !!candidate.hasFeed,
      approval: candidate.networkRank,
    },
    used,
  );
  // invite-core caps at 149; CJ allows longer — pad sector note when room.
  if (msg.length < CJ_MAX_MSG && candidate.primaryCategory) {
    const extra = ` Category: ${String(candidate.primaryCategory).slice(0, 80)}.`;
    const longer = `${msg}${extra}`.slice(0, CJ_MAX_MSG);
    if (!used.has(longer)) {
      used.delete(msg);
      used.add(longer);
      return longer;
    }
  }
  return msg;
}

/**
 * @param {{
 *   live?: boolean,
 *   max?: number,
 *   companyId?: string,
 *   secretFile?: string,
 *   token?: string,
 *   affiliatesRoot?: string,
 *   reportDir?: string,
 *   lockPath?: string,
 *   awsProfile?: string,
 *   fetchFn?: Function,
 *   sleepFn?: Function,
 *   applyFn?: Function,
 *   writeMarkerFn?: Function,
 *   now?: Date,
 *   log?: Function,
 * }} opts
 */
export async function runCjInvite(opts = {}) {
  const live = !!opts.live;
  const max = Math.max(0, Number(opts.max) || 20);
  const companyId = String(opts.companyId || process.env.CJ_COMPANY_ID || '8103947');
  const affiliatesRoot =
    opts.affiliatesRoot ||
    process.env.CJ_AFFILIATES_ROOT ||
    'S:\\a-affiliates\\cj';
  const reportDir =
    opts.reportDir ||
    process.env.CJ_INVITE_REPORT_DIR ||
    'C:\\ai\\a-search\\logs\\cj-invite';
  const lockPath =
    opts.lockPath ||
    process.env.CJ_INVITE_LOCK ||
    'C:\\ProgramData\\a-search\\cj-invite.lock';
  const log =
    typeof opts.log === 'function' ? opts.log : (...a) => console.error(...a);

  const lock = acquireLock(lockPath);
  if (!lock.ok) {
    log('already_running');
    return { code: EXIT_OK, reason: 'already_running' };
  }

  /** @type {object} */
  const report = {
    provider: 'cj',
    live,
    max,
    companyId,
    at: (opts.now || new Date()).toISOString(),
    counts: { candidates: 0, applied: 0, failed: 0, skipped: 0 },
    advertisers: [],
    error: null,
  };

  try {
    let token = opts.token ? String(opts.token).trim() : '';
    if (!token) {
      const secretFile =
        opts.secretFile ||
        process.env.CJ_SECRET_FILE ||
        'C:\\passwords\\cj.secret.txt';
      const loaded = loadCjSecretFile(secretFile);
      token = loaded.token;
    }

    let rows;
    try {
      rows = await listAdvertisers({
        token,
        requestorCid: companyId,
        status: 'notjoined',
        fetchFn: opts.fetchFn,
        sleepFn: opts.sleepFn,
      });
    } catch (err) {
      if (
        err instanceof CjAccountNotActiveError ||
        (err && err.code === 'cj_account_not_active') ||
        (err && err.status === 403)
      ) {
        report.error = 'cj_account_not_active';
        writeReport(reportDir, report);
        log(
          'cj_account_not_active: CJ publisher account not authorised (403). No records written. Activate W-8BEN-E / payment (#5057) then retry.',
        );
        return { code: EXIT_ACCOUNT_NOT_ACTIVE, report };
      }
      throw err;
    }

    const notJoined = filterByRelationship(rows, 'notjoined').filter(
      (r) => !isJunkName(r.name),
    );
    const index = loadInviteIndex({
      provider: 'cj',
      affiliatesRoot,
      cooldownDays: DEFAULT_COOLDOWN_DAYS,
      now: opts.now,
      awsProfile: opts.awsProfile,
    });

    const used = new Set();
    /** @type {object[]} */
    const candidates = [];
    for (const row of rankCjAdvertisers(notJoined)) {
      const skip = classifySkip(String(row.id), index);
      if (skip) {
        report.counts.skipped += 1;
        continue;
      }
      const message = craftCjInviteMessage(row, used);
      candidates.push({
        id: String(row.id),
        name: row.name,
        primaryCategory: row.primaryCategory || '',
        networkRank: row.networkRank,
        epc3Month: row.epc3Month,
        message,
      });
    }
    report.counts.candidates = candidates.length;
    const take = max > 0 ? candidates.slice(0, max) : candidates;
    report.advertisers = take.map((c) => ({
      id: c.id,
      name: c.name,
      message: c.message,
    }));

    if (!live) {
      log(
        `invite dry-run provider=cj candidates=${take.length} (pass --live to apply in Account Manager)`,
      );
      for (const c of take) {
        log(`  would_apply cid=${c.id} name=${redactSecrets(c.name)}`);
      }
      writeReport(reportDir, report);
      printResultLine(report, reportDir, log);
      return { code: EXIT_OK, report };
    }

    const applyFn =
      typeof opts.applyFn === 'function'
        ? opts.applyFn
        : async () => {
            throw new Error(
              'cj_apply_ui_not_wired: Account Manager Playwright apply requires supervised redqueen seat',
            );
          };
    const writeMarker =
      typeof opts.writeMarkerFn === 'function'
        ? opts.writeMarkerFn
        : writeInviteMarkerAws;

    for (const c of take) {
      try {
        await applyFn(c);
        await writeMarker({
          id: c.id,
          name: c.name,
          msg: c.message.slice(0, CJ_MAX_MSG),
          provider: 'cj',
          source: 'invite',
          awsProfile: opts.awsProfile,
          logDir: reportDir,
          existing: index.invites.get(String(c.id)),
        });
        report.counts.applied += 1;
      } catch (err) {
        report.counts.failed += 1;
        log(redactSecrets(`apply_failed cid=${c.id}: ${err && err.message}`));
        if (/captcha|challenge|otp|2fa/i.test(String(err && err.message))) {
          report.error = 'needs_human_sign_in';
          writeReport(reportDir, report);
          printResultLine(report, reportDir, log);
          return { code: EXIT_NEEDS_OTP, report };
        }
      }
    }
    writeReport(reportDir, report);
    printResultLine(report, reportDir, log);
    return {
      code: report.counts.failed && !report.counts.applied ? EXIT_ERROR : EXIT_OK,
      report,
    };
  } catch (err) {
    report.error = redactSecrets(String(err && err.message || err));
    writeReport(reportDir, report);
    log(report.error);
    return { code: EXIT_ERROR, report };
  } finally {
    releaseLock(lockPath);
  }
}

function writeReport(reportDir, report) {
  try {
    fs.mkdirSync(reportDir, { recursive: true });
    const day = String(report.at || new Date().toISOString()).slice(0, 10);
    const file = path.join(reportDir, `${day}.json`);
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  } catch {
    /* ignore report IO */
  }
}

function printResultLine(report, reportDir, log) {
  const day = String(report.at || new Date().toISOString()).slice(0, 10);
  const reportPath = path.join(reportDir, `${day}.json`);
  const line = `invite_result provider=cj live=${!!report.live} candidates=${report.counts.candidates} applied=${report.counts.applied} failed=${report.counts.failed} skipped=${report.counts.skipped} error=${report.error || 'none'} report=${reportPath}`;
  log(line);
  console.log(line);
}

export { craftInviteMessage };
