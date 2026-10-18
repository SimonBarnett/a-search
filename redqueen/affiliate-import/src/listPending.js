'use strict';

/**
 * FR #4001 / #4195: list unprocessed feed files under a-affiliates.
 * Prefers flat `{provider}/{affiliateid}/{yyyy-mm-dd}.{ext}` (already
 * decompressed). Still accepts legacy `.../parts/{date}.{ext}` during cutover.
 * Oldest first. Import deletes on success.
 */

/**
 * @param {{
 *   listObjectsV2: Function,
 *   bucket?: string,
 * }} opts
 * @returns {Promise<{ provider: string, affiliateid: string, key: string, lastModified?: Date }[]>}
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
      if (/\/parts\/latest\./i.test(key)) continue;
      // FR #4195 flat: {provider}/{affiliateid}/{yyyy-mm-dd}.{ext}
      let m = key.match(
        /^([a-z0-9_-]+)\/([^/]+)\/(\d{4}-\d{2}-\d{2})\.[^./]+$/i,
      );
      // Legacy #3999: {provider}/{affiliateid}/parts/{yyyy-mm-dd}.{ext}
      if (!m) {
        m = key.match(
          /^([a-z0-9_-]+)\/([^/]+)\/parts\/(\d{4}-\d{2}-\d{2})\.[^/]+$/i,
        );
      }
      if (!m) continue;
      out.push({
        provider: m[1].toLowerCase(),
        affiliateid: m[2],
        key,
        lastModified: obj.LastModified || obj.lastModified || null,
        dateStamp: m[3],
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
  loadAffiliateMeta,
};
