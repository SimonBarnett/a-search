'use strict';

/**
 * FR #4001 / #4196: list unprocessed feed files under a-affiliates.
 * Layouts:
 *   - #4195 flat: {provider}/{affiliateid}/{yyyy-mm-dd}.{ext}
 *   - #3999 legacy: {provider}/{affiliateid}/parts/{yyyy-mm-dd}.{ext}
 * Oldest first. Ignore markers, AGENT.md, SKILLS.md, _invites/, parts/latest.
 */

const FLAT_RE =
  /^([a-z0-9_-]+)\/([^/]+)\/(\d{4}-\d{2}-\d{2})\.([a-z0-9]+)$/i;
const PARTS_RE =
  /^([a-z0-9_-]+)\/([^/]+)\/parts\/(\d{4}-\d{2}-\d{2})\.([^/]+)$/i;

/**
 * @param {string} key
 * @returns {boolean}
 */
function shouldIgnoreKey(key) {
  const k = String(key || '');
  if (!k || k.endsWith('/')) return true;
  if (/\/parts\/latest\./i.test(k)) return true;
  if (/\/(AGENT|SKILLS)\.md$/i.test(k)) return true;
  if (/\/_invites\//i.test(k)) return true;
  // FR #4701: Rakuten signup application markers are not feed files.
  if (/\/_applications\//i.test(k)) return true;
  if (/\/provider\.json$/i.test(k)) return true;
  return false;
}

/**
 * @param {string} key
 * @returns {{ provider: string, affiliateid: string, key: string, dateStamp: string, layout: 'flat'|'parts' }|null}
 */
function matchFeedKey(key) {
  if (shouldIgnoreKey(key)) return null;
  let m = key.match(FLAT_RE);
  if (m) {
    return {
      provider: m[1].toLowerCase(),
      affiliateid: m[2],
      key,
      dateStamp: m[3],
      layout: 'flat',
    };
  }
  m = key.match(PARTS_RE);
  if (m) {
    return {
      provider: m[1].toLowerCase(),
      affiliateid: m[2],
      key,
      dateStamp: m[3],
      layout: 'parts',
    };
  }
  return null;
}

/**
 * @param {{
 *   listObjectsV2: Function,
 *   bucket?: string,
 * }} opts
 * @returns {Promise<{ provider: string, affiliateid: string, key: string, lastModified?: Date, dateStamp: string, layout: string }[]>}
 */
async function listPendingPartsFiles(opts) {
  const bucket = opts.bucket || 'a-affiliates';
  const out = [];
  let token;
  do {
    const page = await opts.listObjectsV2({
      Bucket: bucket,
      Prefix: '',
      ContinuationToken: token,
    });
    const contents = page.Contents || page.contents || [];
    for (const obj of contents) {
      const key = String(obj.Key || obj.key || '');
      const matched = matchFeedKey(key);
      if (!matched) continue;
      out.push({
        ...matched,
        lastModified: obj.LastModified || obj.lastModified || null,
      });
    }
    token = page.NextContinuationToken || null;
    if (page.IsTruncated && !page.NextContinuationToken) break;
  } while (token);

  out.sort((a, b) => {
    const da = String(a.dateStamp);
    const db = String(b.dateStamp);
    if (da !== db) return da < db ? -1 : 1;
    return String(a.key).localeCompare(String(b.key));
  });
  return out;
}

/** Alias for FR #4196 naming. */
const listPendingFeedFiles = listPendingPartsFiles;

/**
 * Read affiliate marker metadata (format, compression). Never log secrets.
 * compression describes the *source* feed; stored objects are decompressed (#4195).
 * @param {{ getObject: Function, bucket?: string, provider: string, affiliateid: string }} opts
 */
async function loadAffiliateMeta(opts) {
  const bucket = opts.bucket || 'a-affiliates';
  const key = `${opts.provider}/${opts.affiliateid}/`;
  try {
    const obj = await opts.getObject({ Bucket: bucket, Key: key });
    const md = (obj && (obj.Metadata || obj.metadata)) || {};
    return {
      format: String(md.format || md.Format || 'csv').toLowerCase(),
      compression: String(md.compression || md.Compression || 'none').toLowerCase(),
      enabled: String(md.enabled || '1') !== '0',
      // never return password/apitoken even if present
    };
  } catch {
    return { format: 'csv', compression: 'none', enabled: true };
  }
}

module.exports = {
  listPendingPartsFiles,
  listPendingFeedFiles,
  loadAffiliateMeta,
  matchFeedKey,
  shouldIgnoreKey,
};
