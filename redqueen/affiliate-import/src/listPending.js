'use strict';

/**
 * FR #4001: list unprocessed parts files under a-affiliates/{provider}/{affiliateid}/parts/
 * Oldest first. Layout from #3999 (dated files); import deletes on success so no latest needed.
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
      // {provider}/{affiliateid}/parts/{yyyy-mm-dd}.{ext}
      const m = key.match(
        /^([a-z0-9_-]+)\/([^/]+)\/parts\/(\d{4}-\d{2}-\d{2})\.[^/]+$/i,
      );
      if (!m) continue;
      // skip marker-only / latest pointer if still present from #3999
      if (/\/parts\/latest\./i.test(key)) continue;
      out.push({
        provider: m[1].toLowerCase(),
        affiliateid: m[2],
        key,
        lastModified: obj.LastModified || obj.lastModified || null,
        dateStamp: m[3],
      });
    }
    token = page.NextContinuationToken || page.IsTruncated || null;
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
