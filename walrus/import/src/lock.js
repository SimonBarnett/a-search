'use strict';

/**
 * FR #4463: file lock belt-and-braces (%ProgramData%\a-search\import.lock).
 * Mirrors redqueen/affiliate-import lock semantics.
 */

const fs = require('node:fs');
const path = require('node:path');

function defaultLockPath() {
  const base = process.env.ProgramData || process.env.PROGRAMDATA || '';
  if (base) return path.join(base, 'a-search', 'import.lock');
  return path.join(process.cwd(), '.a-search-import.lock');
}

/**
 * @param {string} [lockPath]
 * @param {{ pid?: number, now?: () => number, staleMs?: number }} [opts]
 */
function acquireImportLock(lockPath, opts = {}) {
  const lp = lockPath || defaultLockPath();
  const pid = opts.pid != null ? opts.pid : process.pid;
  const now = opts.now || Date.now;
  const staleMs = opts.staleMs != null ? opts.staleMs : 6 * 60 * 60 * 1000;
  fs.mkdirSync(path.dirname(lp), { recursive: true });

  /** @type {{ ageMs?: number, staleTakeover?: boolean }} */
  const meta = {};
  if (fs.existsSync(lp)) {
    try {
      const raw = JSON.parse(fs.readFileSync(lp, 'utf8'));
      const age = now() - Number(raw.ts || 0);
      meta.ageMs = age;
      // FR #4943: fresh overlap is not a failure; stale (>staleMs) is taken over
      // and reported by the caller as lock_held_stale.
      if (age < staleMs) return { ok: false, code: 'lock_held', ageMs: age };
      meta.staleTakeover = true;
      try {
        fs.unlinkSync(lp);
      } catch {
        // race --- fall through to wx
      }
    } catch {
      // corrupt --- take over
    }
  }

  try {
    const fd = fs.openSync(lp, 'wx');
    fs.writeFileSync(fd, JSON.stringify({ pid, ts: now() }));
    fs.closeSync(fd);
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      return { ok: false, code: 'lock_held', ageMs: meta.ageMs };
    }
    throw err;
  }

  return {
    ok: true,
    path: lp,
    staleTakeover: !!meta.staleTakeover,
    ageMs: meta.ageMs,
    release() {
      try {
        fs.unlinkSync(lp);
      } catch {
        // ignore
      }
    },
  };
}

module.exports = { acquireImportLock, defaultLockPath };
