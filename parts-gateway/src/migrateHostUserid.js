'use strict';

/**
 * FR #4287: a-clubs host markers keep userid only.
 * Dry-run by default. Copy-in-place strips the legacy metadata key,
 * keeps other metadata, tags and annotations, and does not bump
 * lastmod or lastupdate.
 */

const LEGACY = 'customernumber';

/**
 * @param {Record<string, string>|null|undefined} md
 * @returns {{ present: boolean, value: string }}
 */
function legacyValue(md) {
  let present = false;
  let value = '';
  for (const [k, v] of Object.entries(md || {})) {
    if (String(k).toLowerCase() !== LEGACY) continue;
    present = true;
    if (!value) value = String(v == null ? '' : v).trim();
  }
  return { present, value };
}

/**
 * Identity from a-clubs host marker metadata. userid wins; the legacy
 * key is only a fallback until migration has copied it.
 * @param {Record<string, string>|null|undefined} md
 * @returns {string}
 */
function metaUserid(md) {
  const m = md || {};
  const direct = String(m.userid || m.userId || '').trim();
  if (direct) return direct.toUpperCase();
  const legacy = legacyValue(m);
  return legacy.value ? legacy.value.toUpperCase() : '';
}

/**
 * @param {Record<string, string>|null|undefined} md
 * @returns {{ action: 'skip'|'copy'|'remove'|'report', reason?: string, userid?: string }}
 */
function planHostMarker(md) {
  const m = md || {};
  const userid = String(m.userid || m.userId || '').trim();
  const legacy = legacyValue(m);
  if (!legacy.present) {
    return { action: 'skip', reason: userid ? 'userid_only' : 'no_id' };
  }
  if (!userid) {
    return { action: 'copy', userid: legacy.value.toUpperCase() };
  }
  if (userid.toUpperCase() !== legacy.value.toUpperCase()) {
    return { action: 'report', reason: 'differ' };
  }
  return { action: 'remove' };
}

/**
 * @param {Record<string, string>|null|undefined} md
 * @param {{ action: string, userid?: string }} plan
 * @returns {Record<string, string>}
 */
function metadataAfter(md, plan) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(md || {})) {
    if (String(k).toLowerCase() === LEGACY) continue;
    out[k] = v == null ? '' : String(v);
  }
  if (plan && plan.action === 'copy') out.userid = plan.userid || '';
  return out;
}

/**
 * Host folder marker only (`hostkey/`), not GUID children or `_userids/`.
 * @param {unknown} key
 * @returns {boolean}
 */
function isHostMarkerKey(key) {
  const k = String(key || '');
  if (!k.endsWith('/')) return false;
  const parts = k.split('/').filter(Boolean);
  if (parts.length !== 1) return false;
  if (parts[0].startsWith('_')) return false;
  return true;
}

/**
 * @param {{
 *   listObjectsV2: Function,
 *   headObject: Function,
 *   getObject?: Function,
 *   copyObject?: Function,
 *   putObject?: Function,
 *   getObjectTagging?: Function,
 *   putObjectTagging?: Function,
 *   bucket?: string,
 *   prefix?: string,
 *   apply?: boolean,
 * }} opts
 */
async function migrateHostMarkers(opts) {
  if (!opts || typeof opts.listObjectsV2 !== 'function') {
    throw new Error('listObjectsV2_required');
  }
  const apply = opts.apply === true;
  const counts = {
    scanned: 0,
    copy: 0,
    remove: 0,
    report: 0,
    skip: 0,
    applied: 0,
  };
  /** @type {string[]} */
  const reports = [];
  let token;
  do {
    const page = await opts.listObjectsV2({
      Prefix: opts.prefix || '',
      ...(token ? { ContinuationToken: token } : {}),
    });
    const contents = (page && page.Contents) || [];
    for (const item of contents) {
      const Key = item.Key || item.key;
      if (!isHostMarkerKey(Key)) continue;
      counts.scanned += 1;
      const head = await opts.headObject({ Key });
      const metadata = { ...(head.Metadata || head.metadata || {}) };
      const plan = planHostMarker(metadata);
      if (plan.action === 'skip') {
        counts.skip += 1;
        continue;
      }
      if (plan.action === 'report') {
        counts.report += 1;
        reports.push(String(Key));
        continue;
      }
      counts[plan.action] += 1;
      if (!apply) continue;
      const next = metadataAfter(metadata, plan);
      await rewriteInPlace({
        Key: String(Key),
        metadata: next,
        bucket: opts.bucket || 'a-clubs',
        contentType: head.ContentType || head.contentType,
        copyObject: opts.copyObject,
        putObject: opts.putObject,
        getObject: opts.getObject,
        getObjectTagging: opts.getObjectTagging,
        putObjectTagging: opts.putObjectTagging,
      });
      counts.applied += 1;
    }
    token = page && page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return { counts, reports, apply };
}

/**
 * Copy-in-place. Does not change lastmod/lastupdate (caller supplies metadata).
 * In-place REPLACE keeps annotations on the memory store and on S3.
 * @param {{
 *   Key: string,
 *   metadata: Record<string, string>,
 *   bucket: string,
 *   contentType?: string,
 *   copyObject?: Function,
 *   putObject?: Function,
 *   getObject?: Function,
 *   getObjectTagging?: Function,
 *   putObjectTagging?: Function,
 * }} opts
 */
async function rewriteInPlace(opts) {
  const Key = opts.Key;
  if (typeof opts.copyObject === 'function') {
    const encodedKey = Key.split('/')
      .map((p) => encodeURIComponent(p))
      .join('/');
    await opts.copyObject({
      Key,
      CopySource: `${opts.bucket}/${encodedKey}`,
      MetadataDirective: 'REPLACE',
      TaggingDirective: 'COPY',
      Metadata: opts.metadata,
      ...(opts.contentType ? { ContentType: opts.contentType } : {}),
    });
    return;
  }
  if (typeof opts.putObject !== 'function' || typeof opts.getObject !== 'function') {
    throw new Error('copyObject_or_putObject_required');
  }
  const obj = await opts.getObject({ Key });
  let raw = obj.Body != null ? obj.Body : obj.body;
  if (raw && typeof raw.transformToByteArray === 'function') {
    raw = Buffer.from(await raw.transformToByteArray());
  } else if (raw != null && !Buffer.isBuffer(raw)) {
    raw = Buffer.from(String(raw), 'utf8');
  }
  const Body = Buffer.isBuffer(raw) ? raw : Buffer.alloc(0);
  await opts.putObject({
    Key,
    Body,
    ContentLength: Body.length,
    Metadata: opts.metadata,
    ...(opts.contentType ? { ContentType: opts.contentType } : {}),
  });
  if (typeof opts.getObjectTagging === 'function' && typeof opts.putObjectTagging === 'function') {
    const tagged = await opts.getObjectTagging({ Key });
    const TagSet = tagged && Array.isArray(tagged.TagSet) ? tagged.TagSet : [];
    await opts.putObjectTagging({ Key, Tagging: { TagSet } });
  }
}

/**
 * Counts only. No metadata values.
 * @param {{ counts: Record<string, number>, apply: boolean }} result
 * @returns {string}
 */
function formatMigrationCounts(result) {
  const c = result.counts;
  return [
    `scanned=${c.scanned}`,
    `copy=${c.copy}`,
    `remove=${c.remove}`,
    `report=${c.report}`,
    `skip=${c.skip}`,
    `applied=${c.applied}`,
    `dryRun=${result.apply ? 0 : 1}`,
  ].join(' ');
}

module.exports = {
  metaUserid,
  planHostMarker,
  metadataAfter,
  isHostMarkerKey,
  migrateHostMarkers,
  formatMigrationCounts,
};
