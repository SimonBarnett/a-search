'use strict';

/**
 * FR #4123: single-instance lock for the daily Awin onboarding agent.
 * Second start exits 0 with already_running (caller maps code).
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {string} lockPath
 * @param {{ pid?: number, now?: () => number, staleMs?: number }} [opts]
 * @returns {{ ok: true, release: () => void } | { ok: false, code: 'already_running' }}
 */
function acquireAwinAgentLock(lockPath, opts = {}) {
  const pid = opts.pid != null ? opts.pid : process.pid;
  const now = opts.now || Date.now;
  const staleMs = opts.staleMs != null ? opts.staleMs : 6 * 60 * 60 * 1000;
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  if (fs.existsSync(lockPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      const age = now() - Number(raw.ts || 0);
      if (age < staleMs) {
        return { ok: false, code: 'already_running' };
      }
    } catch {
      // corrupt --- take over
    }
  }

  const payload = JSON.stringify({ pid, ts: now() });
  try {
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeFileSync(fd, payload);
    fs.closeSync(fd);
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      return { ok: false, code: 'already_running' };
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

module.exports = { acquireAwinAgentLock };
