'use strict';

/**
 * FR #4701: Rakuten publisher UI credentials (two-line secret file).
 * Never log password or codes into reports.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_SECRET_PATH = 'C:\\passwords\\rakuten.secret.txt';

/**
 * @param {string} [filePath]
 * @param {{ readFileSync?: Function }} [io]
 * @returns {{ email: string, password: string }}
 */
function readRakutenSecretFile(filePath, io = {}) {
  const p = filePath || process.env.RAKUTEN_SECRET_FILE || DEFAULT_SECRET_PATH;
  const read = io.readFileSync || fs.readFileSync;
  const raw = read(p, 'utf8');
  const lines = String(raw)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/);
  const email = String(lines[0] || '').trim();
  const password = String(lines[1] || '');
  if (!email || !password) {
    const err = new Error('rakuten_secret_incomplete');
    err.code = 'rakuten_secret_incomplete';
    throw err;
  }
  return { email, password };
}

/**
 * @param {string} password
 * @param {{ writeFileSync?: Function, mkdtempSync?: Function }} [io]
 */
function writePasswordTemp(password, io = {}) {
  const mkdtemp = io.mkdtempSync || fs.mkdtempSync.bind(fs);
  const write = io.writeFileSync || fs.writeFileSync;
  const dir = mkdtemp(path.join(os.tmpdir(), 'rakuten-agent-pw-'));
  const file = path.join(dir, 'pw.txt');
  write(file, password, { encoding: 'utf8', mode: 0o600 });
  return file;
}

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
  readRakutenSecretFile,
  writePasswordTemp,
  redactSecrets,
  assertNoSecrets,
  DEFAULT_SECRET_PATH,
};
