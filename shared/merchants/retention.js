'use strict';

/**
 * FR #4008: keep last N dated parts files; return older keys to delete.
 */

const DEFAULT_KEEP = 4;
const DATED_RE = /^(.*\/parts\/)(\d{4}-\d{2}-\d{2})\.([^/]+)$/;

function pickDatedPartsKeysToDelete(keys, opts) {
  const keep = opts && opts.keep != null ? Number(opts.keep) : DEFAULT_KEEP;
  const n = Number.isFinite(keep) && keep >= 0 ? Math.floor(keep) : DEFAULT_KEEP;

  /** @type {{ key: string, date: string }[]} */
  const dated = [];
  for (const key of keys || []) {
    const k = String(key || '');
    const m = DATED_RE.exec(k);
    if (!m) continue;
    dated.push({ key: k, date: m[2] });
  }

  dated.sort((a, b) => {
    if (a.date < b.date) return 1;
    if (a.date > b.date) return -1;
    return a.key < b.key ? 1 : a.key > b.key ? -1 : 0;
  });

  if (dated.length <= n) return [];
  return dated.slice(n).map((d) => d.key);
}

module.exports = {
  DEFAULT_KEEP,
  DATED_RE,
  pickDatedPartsKeysToDelete,
};
