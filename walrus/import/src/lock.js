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

  if (fs.existsSync(lp)) {
    try {
      const raw = JSON.parse(fs.readFileSync(lp, 'utf8'));
      const age = now() - Number(raw.ts || 0);
      if (age < staleMs) return { ok: false, code: 'lock_held' };
    } catch {
      // corrupt --- take over
    }
  }

  try {
    const fd = fs.openSync(lp, 'wx');
    fs.writeFileSync(fd, JSON.stringify({ pid, ts: now() }));
    fs.closeSync(fd);
  } catch (err) {
    if (err && err.code === 'EEXIST') return { ok: false, code: 'lock_held' };
    throw err;
  }

  return {
    ok: true,
    path: lp,
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
