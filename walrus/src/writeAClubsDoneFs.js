'use strict';

/**
 * FR #4917: write DONE/{searchid}-{source}.json on the mapped a-clubs drive
 * and flip hasresults=1 in .a-search-meta.json when the fan-out is complete.
 */

const fs = require('node:fs');
const path = require('node:path');

const { hostGuidFromMessage } = require('./aClubsInPath');
const { isoLastmod } = require('./touchLastmodFs');

/**
 * @param {string} root
 * @param {string[]} parts
 * @returns {string}
 */
function absUnder(root, parts) {
  const clean = parts
    .map((p) => String(p || '').trim())
    .filter((p) => p && p !== '.' && p !== '..');
  return path.join(root, ...clean);
}

/**
 * @param {{
 *   root: string,
 *   msg: object,
 *   source: string,
 *   status?: 'serviced'|'dlq',
 *   products?: number,
 *   now?: Date|string|number,
 * }} opts
 * @returns {{ key: string, abs: string, hasresults: boolean }}
 */
function writeAClubsDoneFs(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('write_a_clubs_done_opts_required');
  }
  const root = opts.root != null ? String(opts.root).trim() : '';
  if (!root) throw new Error('empty_a_clubs_root');
  const { host, guid } = hostGuidFromMessage(opts.msg);
  const searchid = String(
    (opts.msg && (opts.msg.searchid != null ? opts.msg.searchid : opts.msg.searchId)) ||
      '',
  )
    .trim()
    .replace(/-sql$/i, '');
  const source = String(opts.source || (opts.msg && opts.msg.source) || '')
    .trim()
    .toLowerCase();
  if (!searchid || !source) {
    return { key: null, abs: null, hasresults: false, skipped: 'missing_path' };
  }
  const status = String(opts.status || 'serviced').trim().toLowerCase();
  if (status !== 'serviced' && status !== 'dlq') {
    throw new Error('status must be serviced or dlq');
  }
  const products = Number.isFinite(Number(opts.products))
    ? Math.max(0, Math.floor(Number(opts.products)))
    : 0;
  const at = isoLastmod(opts.now);
  const key = `${host}/${guid}/DONE/${searchid}-${source}.json`;
  const abs = absUnder(root, [host, guid, 'DONE', `${searchid}-${source}.json`]);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const body = { searchid, source, status, products, at };
  fs.writeFileSync(abs, `${JSON.stringify(body)}\n`, 'utf8');

  const hasresults = maybeSetHasResultsFs({
    root,
    host,
    guid,
    searchid,
    now: opts.now,
  });
  return { key, abs, hasresults: !!hasresults, body };
}

/**
 * @param {{
 *   root: string,
 *   host: string,
 *   guid: string,
 *   searchid: string,
 *   now?: Date|string|number,
 * }} opts
 * @returns {boolean}
 */
function maybeSetHasResultsFs(opts) {
  const root = String(opts.root || '').trim();
  const host = String(opts.host || '').trim();
  const guid = String(opts.guid || '').trim();
  const wantSid = String(opts.searchid || '').trim();
  if (!root || !host || !guid || !wantSid) return false;

  const fanoutAbs = absUnder(root, [host, guid, 'search-fanout.json']);
  if (!fs.existsSync(fanoutAbs)) return false;
  let fanout;
  try {
    fanout = JSON.parse(fs.readFileSync(fanoutAbs, 'utf8'));
  } catch {
    return false;
  }
  const fanSid = String((fanout && fanout.searchid) || '').trim();
  const queued = Array.isArray(fanout && fanout.queued)
    ? fanout.queued.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
    : [];
  if (!fanSid || fanSid !== wantSid || !queued.length) return false;

  for (const src of queued) {
    const doneAbs = absUnder(root, [
      host,
      guid,
      'DONE',
      `${wantSid}-${src}.json`,
    ]);
    if (!fs.existsSync(doneAbs)) return false;
  }

  // Reuse touchLastmodFs meta file; set hasresults=1 while preserving keys.
  const metaAbs = absUnder(root, [host, guid, '.a-search-meta.json']);
  /** @type {Record<string, unknown>} */
  let metadata = {};
  if (fs.existsSync(metaAbs)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(metaAbs, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        metadata = parsed;
      }
    } catch {
      metadata = {};
    }
  }
  metadata.hasresults = '1';
  metadata.lastmod = isoLastmod(opts.now);
  fs.mkdirSync(path.dirname(metaAbs), { recursive: true });
  fs.writeFileSync(metaAbs, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  return true;
}

module.exports = {
  writeAClubsDoneFs,
  maybeSetHasResultsFs,
};
