'use strict';

/**
 * FR #4001: non-overlapping lock for scheduled task + fixing agent.
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {string} lockPath
 * @param {{ pid?: number, now?: () => number, staleMs?: number }} [opts]
 * @returns {{ ok: true, release: () => void } | { ok: false, code: string }}
 */
function acquireImportLock(lockPath, opts = {}) {
  const pid = opts.pid != null ? opts.pid : process.pid;
  const now = opts.now || Date.now;
  const staleMs = opts.staleMs != null ? opts.staleMs : 6 * 60 * 60 * 1000;
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  if (fs.existsSync(lockPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      const age = now() - Number(raw.ts || 0);
      if (age < staleMs) {
        return { ok: false, code: 'lock_held' };
      }
    } catch {
      // corrupt lock --- take over
    }
  }

  const payload = JSON.stringify({ pid, ts: now() }, null, 0);
  try {
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeFileSync(fd, payload);
    fs.closeSync(fd);
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      return { ok: false, code: 'lock_held' };
    }
    throw err;
  }

  return {
    ok: true,
    release() {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // ignore
      }
    },
  };
}

module.exports = { acquireImportLock };
