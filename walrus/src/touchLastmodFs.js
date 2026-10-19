'use strict';

/**
 * FR #4447: bump host/guid lastmod on the mapped a-clubs drive (filesystem).
 * Writes/updates a small `.a-search-meta.json` beside the folder marker key.
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {Date|string|number|undefined} now
 * @returns {string}
 */
function isoLastmod(now) {
  const d =
    now instanceof Date
      ? now
      : now != null && now !== ''
        ? new Date(now)
        : new Date();
  return d.toISOString();
}

/**
 * @param {string} root
 * @param {string} key  e.g. host/ or host/guid/
 * @returns {string}
 */
function metaAbs(root, key) {
  const parts = String(key || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((p) => p && p !== '.' && p !== '..');
  return path.join(root, ...parts, '.a-search-meta.json');
}

/**
 * @param {{
 *   root: string,
 *   Key: string,
 *   now?: Date|string|number,
 * }} opts
 * @returns {{ Key: string, lastmod: string, abs: string }}
 */
function touchLastmodFs(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('touchLastmodFs opts required');
  }
  const root = opts.root != null ? String(opts.root).trim() : '';
  if (!root) throw new Error('empty_a_clubs_root');
  const Key = opts.Key != null ? String(opts.Key).trim() : '';
  if (!Key) throw new Error('marker_key_required');

  const abs = metaAbs(root, Key);
  fs.mkdirSync(path.dirname(abs), { recursive: true });

  /** @type {Record<string, unknown>} */
  let metadata = {};
  if (fs.existsSync(abs)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        metadata = parsed;
      }
    } catch {
      metadata = {};
    }
  }

  const lastmod = isoLastmod(opts.now);
  metadata.lastmod = lastmod;
  fs.writeFileSync(abs, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  return { Key, lastmod, abs };
}

/**
 * @param {string} root
 * @returns {(opts: { Key: string, now?: Date|string|number }) => Promise<object>}
 */
function createTouchLastmodFs(root) {
  const r = root != null ? String(root).trim() : '';
  return async function touchLastmod(opts) {
    return touchLastmodFs({ root: r, Key: opts && opts.Key, now: opts && opts.now });
  };
}

module.exports = {
  isoLastmod,
  touchLastmodFs,
  createTouchLastmodFs,
};
