'use strict';

/**
 * FR #4827: stable hash of searches.json {queries, exclude}.
 * searchid / market / currency are not part of the hash, so writing the
 * searchid back does not look like a new edit.
 */

const crypto = require('node:crypto');

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const src = /** @type {Record<string, unknown>} */ (value);
    const out = {};
    const keys = Object.keys(src).sort();
    for (let i = 0; i < keys.length; i += 1) {
      out[keys[i]] = stable(src[keys[i]]);
    }
    return out;
  }
  return value;
}

/**
 * @param {{ queries?: unknown, exclude?: unknown }} [doc]
 * @returns {string} sha256 hex
 */
function searchesContentHash(doc) {
  const src = doc && typeof doc === 'object' ? doc : {};
  const payload = stable({
    queries: Array.isArray(src.queries) ? src.queries : [],
    exclude: Array.isArray(src.exclude) ? src.exclude : [],
  });
  return crypto.createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
}

/**
 * True when there is no searchid, or the stored marker hash differs.
 * A searchid with no searcheshash yet is not a mismatch: historical folders
 * stay quiet until a hash is recorded. A later edit then differs and posts.
 * @param {{ doc?: { searchid?: unknown, queries?: unknown, exclude?: unknown }, markerMeta?: Record<string, unknown> }} [input]
 * @returns {boolean}
 */
function shouldPostSearch(input) {
  const doc = input && input.doc && typeof input.doc === 'object' ? input.doc : {};
  const searchid = doc.searchid != null ? String(doc.searchid).trim() : '';
  if (!searchid) return true;
  const meta = input && input.markerMeta && typeof input.markerMeta === 'object'
    ? input.markerMeta
    : {};
  const prev = meta.searcheshash != null ? String(meta.searcheshash).trim().toLowerCase() : '';
  if (!prev) return false;
  const current = searchesContentHash({ queries: doc.queries, exclude: doc.exclude });
  return current !== prev;
}

module.exports = {
  searchesContentHash,
  shouldPostSearch,
};
