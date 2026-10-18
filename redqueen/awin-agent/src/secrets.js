'use strict';

/**
 * FR #4123: Awin UI credentials from Merc's two-line secret file.
 * Never log or return password into reports; callers type from temp then delete.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_SECRET_PATH = 'C:\\passwords\\awin.secret.txt';

/**
 * @param {string} [filePath]
 * @param {{ readFileSync?: Function }} [io]
 * @returns {{ email: string, password: string }}
 */
function readAwinSecretFile(filePath, io = {}) {
  const p = filePath || process.env.AWIN_SECRET_FILE || DEFAULT_SECRET_PATH;
  const read = io.readFileSync || fs.readFileSync;
  const raw = read(p, 'utf8');
  const lines = String(raw)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/);
  const email = String(lines[0] || '').trim();
  const password = String(lines[1] || '');
  if (!email || !password) {
    const err = new Error('awin_secret_incomplete');
    err.code = 'awin_secret_incomplete';
    throw err;
  }
  return { email, password };
}

/**
 * Write password to a temp file for typing; caller must unlink.
 * @param {string} password
 * @param {{ writeFileSync?: Function, mkdtempSync?: Function }} [io]
 * @returns {string} temp path
 */
function writePasswordTemp(password, io = {}) {
  const mkdtemp = io.mkdtempSync || fs.mkdtempSync.bind(fs);
  const write = io.writeFileSync || fs.writeFileSync;
  const dir = mkdtemp(path.join(os.tmpdir(), 'awin-agent-pw-'));
  const file = path.join(dir, 'pw.txt');
  write(file, password, { encoding: 'utf8', mode: 0o600 });
  return file;
}

/**
 * Redact known secret needles from a string (logs / reports).
 * @param {string} text
 * @param {string[]} secrets
 * @returns {string}
 */
function redactSecrets(text, secrets) {
  let out = String(text == null ? '' : text);
  for (const s of secrets || []) {
    if (!s) continue;
    const needle = String(s);
    if (!needle) continue;
    out = out.split(needle).join('[REDACTED]');
  }
  return out;
}

/**
 * Assert a blob (stdout/report/meta) contains none of the secrets.
 * @param {unknown} blob
 * @param {string[]} secrets
 */
function assertNoSecrets(blob, secrets) {
  const text =
    typeof blob === 'string'
      ? blob
      : JSON.stringify(blob == null ? '' : blob);
  for (const s of secrets || []) {
    if (s && text.includes(String(s))) {
      const err = new Error('secret_leaked');
      err.code = 'secret_leaked';
      throw err;
    }
  }
}

module.exports = {
  DEFAULT_SECRET_PATH,
  readAwinSecretFile,
  writePasswordTemp,
  redactSecrets,
  assertNoSecrets,
};
