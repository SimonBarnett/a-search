'use strict';

/**
 * FR-204: Agent site pass - first pass writes site.md + seeds top10.json.
 * CWD = {root}/{env}/x/{customerNumber}/ (FR-233). Idempotent: existing
 * site.md is never regenerated. No secrets in site.md.
 */

const fs = require('node:fs');
const path = require('node:path');
const { hostDir } = require('./widgetPath');

/** Patterns that must never appear in site.md (fail-when: writes secrets). */
const SECRET_NEEDLES = [
  /password\s*[:=]/i,
  /api[_-]?key\s*[:=]/i,
  /secret\s*[:=]/i,
  /bearer\s+[a-z0-9._-]+/i,
  /aws_secret/i,
  /BEGIN\s+(RSA\s+)?PRIVATE\s+KEY/i,
  /nickserv/i,
  /sasl/i,
];

/**
 * @param {string} root
 * @param {string} key forward-slash relative key
 * @returns {string}
 */
function underRoot(root, key) {
  return path.join(root, ...String(key).split('/').filter(Boolean));
}

/**
 * Absolute customer tree directory (agent CWD).
 * @param {{ root: string, env: string, customerNumber: string|number }} opts
 * @returns {string}
 */
function customerCwd(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('site_pass_opts_required');
  }
  const root = opts.root == null ? '' : String(opts.root);
  if (!root) throw new Error('empty_root');
  const key = hostDir(opts.env, opts.customerNumber);
  return underRoot(root, key);
}

/**
 * Build affiliate skillbook markdown (no credentials).
 * @param {{ host: string, customerNumber: string, env: string }} meta
 * @returns {string}
 */
function buildSiteMd(meta) {
  const host = meta.host == null ? '' : String(meta.host).trim();
  const customerNumber = String(meta.customerNumber).trim();
  const env = String(meta.env).trim();
  const lines = [
    '# Site skillbook',
    '',
    'Affiliate skillbook for ComponentsPiece agent site pass (FR-204).',
    'This file is agent-owned. Do not put secrets, tokens, or API keys here.',
    '',
    '## Site',
    '',
    `- host: ${host || '(unknown)'}`,
    `- customerNumber: ${customerNumber}`,
    `- env: ${env}`,
    '',
    '## Mission',
    '',
    '- Maintain per-widget live.json parts for this customer tree.',
    '- Prefer GBP / UK-relevant catalogue when the host serves UK shoppers.',
    '- Seed and refresh top10.json with the best current deals across widgets.',
    '- Never write affiliate destination URLs into widget markup; clicks use GET /go.',
    '',
    '## Skillbook rules',
    '',
    '1. Read this site.md before URI/widget maintain (FR-205+).',
    '2. Use normalised in.json hits only; delete in.json after ingest into live.json.',
    '3. Keep searches.json small and aimed at cheapest relevant queries.',
    '4. Roll top10.json from live parts (title, price, merchant, partNumber, score).',
    '5. If credentials are required, load them from the runtime secret store - never paste them here.',
    '',
    '## Out of scope for this file',
    '',
    '- DNS TXT approval (FR-200)',
    '- Widget JS / CSS (FR-201 / FR-202 / FR-203)',
    '',
  ];
  return lines.join('\n');
}

/**
 * Seed document for top10.json when absent.
 * @returns {{ parts: object[], updatedAt: string, seededBy: string }}
 */
function seedTop10() {
  return {
    parts: [],
    updatedAt: new Date().toISOString(),
    seededBy: 'fr-204-site-pass',
  };
}

/**
 * Write text only if absent (exclusive create).
 * @param {string} absPath
 * @param {string} text
 * @returns {boolean} true when created
 */
function writeTextIfAbsent(absPath, text) {
  if (fs.existsSync(absPath)) return false;
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  let fd;
  try {
    fd = fs.openSync(absPath, 'wx');
  } catch (err) {
    if (err && (err.code === 'EEXIST' || err.code === 'EPERM')) return false;
    throw err;
  }
  try {
    fs.writeFileSync(fd, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  } finally {
    fs.closeSync(fd);
  }
  return true;
}

/**
 * Write JSON only if absent.
 * @param {string} absPath
 * @param {unknown} value
 * @returns {boolean}
 */
function writeJsonIfAbsent(absPath, value) {
  if (fs.existsSync(absPath)) return false;
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  let fd;
  try {
    fd = fs.openSync(absPath, 'wx');
  } catch (err) {
    if (err && (err.code === 'EEXIST' || err.code === 'EPERM')) return false;
    throw err;
  }
  try {
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } finally {
    fs.closeSync(fd);
  }
  return true;
}

/**
 * Assert site.md content has no secret-shaped needles.
 * @param {string} text
 */
function assertNoSecrets(text) {
  for (const re of SECRET_NEEDLES) {
    if (re.test(text)) {
      const err = new Error('site_md_contains_secrets');
      err.code = 'site_md_contains_secrets';
      throw err;
    }
  }
}

/**
 * Run agent site pass for a customer tree.
 * Triggered by host_created or widget_created when site.md is missing.
 *
 * @param {{
 *   root: string,
 *   env: string,
 *   customerNumber: string|number,
 *   host?: string,
 *   event?: string,
 * }} opts
 * @returns {{
 *   skipped: boolean,
 *   reason?: string,
 *   cwd: string,
 *   siteMdPath: string,
 *   top10Path: string,
 *   siteMdCreated: boolean,
 *   top10Created: boolean,
 *   event?: string,
 * }}
 */
function runSitePass(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('site_pass_opts_required');
  }
  const event =
    opts.event == null || opts.event === ''
      ? 'site_pass'
      : String(opts.event).trim();
  const cwd = customerCwd(opts);
  const siteMdPath = path.join(cwd, 'site.md');
  const top10Path = path.join(cwd, 'top10.json');

  fs.mkdirSync(cwd, { recursive: true });

  if (fs.existsSync(siteMdPath)) {
    // Idempotent: never regenerate site.md on duplicate host_created/widget_created.
    let top10Created = false;
    if (!fs.existsSync(top10Path)) {
      top10Created = writeJsonIfAbsent(top10Path, seedTop10());
    }
    return {
      skipped: true,
      reason: 'site_md_exists',
      cwd,
      siteMdPath,
      top10Path,
      siteMdCreated: false,
      top10Created,
      event,
    };
  }

  const host =
    opts.host != null
      ? String(opts.host).trim()
      : readHostFromTree(cwd) || '';
  const body = buildSiteMd({
    host,
    customerNumber: opts.customerNumber,
    env: opts.env,
  });
  assertNoSecrets(body);

  const siteMdCreated = writeTextIfAbsent(siteMdPath, body);
  if (!siteMdCreated && fs.existsSync(siteMdPath)) {
    // Race: another writer won; treat as skip.
    return {
      skipped: true,
      reason: 'site_md_exists',
      cwd,
      siteMdPath,
      top10Path,
      siteMdCreated: false,
      top10Created: false,
      event,
    };
  }
  if (!siteMdCreated) {
    const err = new Error('site_md_write_failed');
    err.code = 'site_md_write_failed';
    throw err;
  }

  // Fail-when guard: must exist after pass.
  if (!fs.existsSync(siteMdPath)) {
    const err = new Error('site_md_missing_after_pass');
    err.code = 'site_md_missing_after_pass';
    throw err;
  }

  const written = fs.readFileSync(siteMdPath, 'utf8');
  assertNoSecrets(written);

  const top10Created = writeJsonIfAbsent(top10Path, seedTop10());

  return {
    skipped: false,
    cwd,
    siteMdPath,
    top10Path,
    siteMdCreated: true,
    top10Created,
    event,
  };
}

/**
 * @param {string} cwd
 * @returns {string|null}
 */
function readHostFromTree(cwd) {
  const hostPath = path.join(cwd, '_host.json');
  if (!fs.existsSync(hostPath)) return null;
  try {
    const doc = JSON.parse(fs.readFileSync(hostPath, 'utf8'));
    return doc && doc.host != null ? String(doc.host).trim() : null;
  } catch {
    return null;
  }
}

/**
 * Convenience: run site pass when event is host_created or widget_created
 * (or always when event omitted / site_pass).
 * @param {object} opts same as runSitePass
 */
function onTreeEvent(opts) {
  const event =
    opts && opts.event != null ? String(opts.event).trim() : 'site_pass';
  const allowed = new Set([
    'host_created',
    'widget_created',
    'site_pass',
    '',
  ]);
  if (!allowed.has(event)) {
    return {
      skipped: true,
      reason: 'event_ignored',
      event,
      cwd: opts ? customerCwd(opts) : '',
      siteMdPath: '',
      top10Path: '',
      siteMdCreated: false,
      top10Created: false,
    };
  }
  return runSitePass({ ...opts, event: event || 'site_pass' });
}

module.exports = {
  customerCwd,
  buildSiteMd,
  seedTop10,
  runSitePass,
  onTreeEvent,
  assertNoSecrets,
  SECRET_NEEDLES,
};
