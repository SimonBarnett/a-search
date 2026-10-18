'use strict';

/**
 * FR #4196: one self-closing fix agent per failing file (key+ETag lock).
 * Grok first, then Cursor. Auto-exits 0 after successful re-import; non-zero
 * when unfixable (3 attempts / 30 min / code bug). Never touches madeiradb,
 * never prints secrets, never loosens the safety guard.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { acquireImportLock } = require('./lock');
const { triggerFixingAgent, redactCredentialLine } = require('./triggerAgent');

const MAX_ATTEMPTS = 3;
const MAX_MS = 30 * 60 * 1000;

/**
 * @param {string} fileKey
 * @param {string} etag
 */
function fixLockPathFor(fileKey, etag) {
  const h = crypto
    .createHash('sha1')
    .update(`${fileKey}|${etag || ''}`)
    .digest('hex')
    .slice(0, 16);
  const base =
    process.env.PROGRAMDATA ||
    process.env.TMPDIR ||
    require('node:os').tmpdir();
  return path.join(base, 'a-search', `affiliate-import-fix-${h}.lock`);
}

/**
 * @param {{
 *   provider: string,
 *   affiliateid: string,
 *   fileKey: string,
 *   etag?: string,
 *   reason: string,
 *   lastImportLog?: object,
 *   mountRoot?: string,
 *   nowMs?: () => number,
 *   maxAttempts?: number,
 *   maxMs?: number,
 *   reimport?: () => Promise<{ ok: boolean, code?: string, reason?: string }>,
 *   writeSkills?: (lesson: string, scope: 'root'|'provider') => Promise|void,
 *   updateMarker?: (patch: object) => Promise|void,
 *   fileBug?: (opts: object) => Promise<{ created: boolean, number?: number }>,
 *   notifySimon?: (text: string) => Promise|void,
 *   startGrok?: Function,
 *   startCursor?: Function,
 *   grokTokensRemaining?: number,
 *   log?: (s: string) => void,
 *   lockPath?: string,
 * }} opts
 * @returns {Promise<{ exitCode: number, code: string, attempts: number, lockedOut?: boolean }>}
 */
async function runFixAgent(opts) {
  const log = (line) => {
    const safe = redactCredentialLine(line);
    if (typeof opts.log === 'function') opts.log(safe);
  };
  const etag = opts.etag || '';
  const lockPath =
    opts.lockPath || fixLockPathFor(opts.fileKey, etag);
  const lock = acquireImportLock(lockPath, {
    now: opts.nowMs || Date.now,
    staleMs: (opts.maxMs != null ? opts.maxMs : MAX_MS) + 60_000,
  });
  if (!lock.ok) {
    log(`fix-agent: lock held for ${opts.fileKey}; skip second agent`);
    return { exitCode: 0, code: 'lock_held', attempts: 0, lockedOut: true };
  }

  const started = (opts.nowMs || Date.now)();
  const maxAttempts = opts.maxAttempts != null ? opts.maxAttempts : MAX_ATTEMPTS;
  const maxMs = opts.maxMs != null ? opts.maxMs : MAX_MS;
  let attempts = 0;

  try {
    await triggerFixingAgent({
      provider: opts.provider,
      affiliateid: opts.affiliateid,
      fileKey: opts.fileKey,
      reason: opts.reason,
      logPath: opts.lastImportLog || null,
      grokTokensRemaining: opts.grokTokensRemaining,
      startGrok: opts.startGrok,
      startCursor: opts.startCursor,
      fr: '#4196',
      cwdHint:
        opts.mountRoot ||
        `S:\\a-affiliates\\${opts.provider}\\${opts.affiliateid}`,
      rulesExtra: [
        'cwd = failing affiliate folder; read AGENTS.md + SKILLS.md then diagnose',
        'May fix format/compression/column mapping on markers; re-run download -Force for truncated files',
        'May write a-search staging only; never madeiradb; never AWS/IAM; never loosen safety guard',
        'After successful re-import: harvest SKILLS.md, stamp lastfix/lastfixnote, exit 0',
        'After 3 attempts or 30 min or code bug: needs_fix, one deduped bug, notify Simon, exit non-zero',
      ],
    });

    while (attempts < maxAttempts) {
      const elapsed = (opts.nowMs || Date.now)() - started;
      if (elapsed >= maxMs) {
        break;
      }
      attempts += 1;
      if (typeof opts.reimport !== 'function') {
        return {
          exitCode: 1,
          code: 'no_reimport',
          attempts,
        };
      }
      const r = await opts.reimport();
      if (r && r.ok) {
        const lesson = `affiliate-import fix: ${opts.provider}/${opts.affiliateid} ${opts.fileKey} recovered after ${attempts} attempt(s); reason was ${opts.reason}`;
        if (typeof opts.writeSkills === 'function') {
          await opts.writeSkills(lesson, 'provider');
        }
        if (typeof opts.updateMarker === 'function') {
          await opts.updateMarker({
            lastfix: new Date((opts.nowMs || Date.now)()).toISOString(),
            lastfixnote: String(opts.reason || 'fixed').slice(0, 200),
            lastimportstatus: 'ok',
          });
        }
        log(`fix-agent: ok after ${attempts} attempt(s)`);
        return { exitCode: 0, code: 'fixed', attempts };
      }
      log(
        `fix-agent: attempt ${attempts} failed code=${(r && r.code) || 'fail'}`,
      );
    }

    if (typeof opts.updateMarker === 'function') {
      await opts.updateMarker({
        lastimportstatus: 'needs_fix',
        lastfix: new Date((opts.nowMs || Date.now)()).toISOString(),
        lastfixnote: String(opts.reason || 'unfixed').slice(0, 200),
      });
    }
    let bug = { created: false };
    if (typeof opts.fileBug === 'function') {
      bug = await opts.fileBug({
        title: `affiliate-import needs_fix ${opts.provider}/${opts.affiliateid}`,
        body: [
          `fileKey=${opts.fileKey}`,
          `etag=${etag}`,
          `reason=${opts.reason}`,
          `attempts=${attempts}`,
          'dedupe: same title — do not open a second issue for this file ETag',
        ].join('\n'),
        dedupeKey: `affiliate-import:${opts.fileKey}:${etag}`,
      });
    }
    if (typeof opts.notifySimon === 'function') {
      await opts.notifySimon(
        `affiliate-import needs_fix ${opts.provider}/${opts.affiliateid} ${opts.fileKey}`,
      );
    }
    log(`fix-agent: needs_fix bug_created=${Boolean(bug && bug.created)}`);
    return { exitCode: 1, code: 'needs_fix', attempts };
  } finally {
    lock.release();
  }
}

/**
 * Append one ASCII lesson line to a SKILLS.md path (create if missing).
 * @param {string} skillsPath
 * @param {string} lesson
 */
function appendSkillsLesson(skillsPath, lesson) {
  const line = `- ${String(lesson).replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?')}\n`;
  fs.mkdirSync(path.dirname(skillsPath), { recursive: true });
  fs.appendFileSync(skillsPath, line, { encoding: 'utf8' });
}

module.exports = {
  runFixAgent,
  fixLockPathFor,
  appendSkillsLesson,
  MAX_ATTEMPTS,
  MAX_MS,
};
