'use strict';

/**
 * FR #4701: application records under a-affiliates/rakuten/_applications/{key}/
 * Zero-byte marker + SSE-S3 metadata. Key by mid when known, else slug. Never invent MIDs.
 */

const PREFIX = 'rakuten/_applications/';

/**
 * @param {{ mid?: string, slug?: string, name?: string }} row
 */
function applicationKey(row) {
  const mid = String((row && row.mid) || '').trim();
  if (mid) return `${PREFIX}${mid}/`;
  const slug = String((row && row.slug) || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug) return `${PREFIX}${slug}/`;
  const nameSlug = String((row && row.name) || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return `${PREFIX}${nameSlug || 'unknown'}/`;
}

/**
 * Flatten metadata to string values under ~2KB.
 * @param {object} meta
 */
function toMeta(meta) {
  const out = {};
  for (const [k, v] of Object.entries(meta || {})) {
    if (v == null || v === '') continue;
    out[String(k).toLowerCase()] = String(v).slice(0, 400);
  }
  const json = JSON.stringify(out);
  if (json.length > 1900) {
    if (out.message) out.message = out.message.slice(0, 80);
  }
  return out;
}

/**
 * @param {{
 *   s3: { putObject: Function, headObject?: Function, listObjectsV2?: Function },
 *   bucket?: string,
 *   record: object,
 *   dryRun?: boolean,
 * }} opts
 */
async function writeApplicationRecord(opts) {
  const bucket = opts.bucket || 'a-affiliates';
  const key = applicationKey(opts.record);
  const Metadata = toMeta(opts.record);
  if (opts.dryRun) {
    return { action: 'would_write', key, metadata: Metadata };
  }
  await opts.s3.putObject({
    Bucket: bucket,
    Key: key,
    Body: Buffer.alloc(0),
    Metadata,
    ServerSideEncryption: 'AES256',
  });
  return { action: 'written', key, metadata: Metadata };
}

/**
 * @param {{
 *   s3: { listObjectsV2: Function, headObject: Function },
 *   bucket?: string,
 * }} opts
 * @returns {Promise<Array<{ key: string, metadata: object }>>}
 */
async function listApplicationRecords(opts) {
  const bucket = opts.bucket || 'a-affiliates';
  const out = [];
  let token;
  do {
    const page = await opts.s3.listObjectsV2({
      Bucket: bucket,
      Prefix: PREFIX,
      ContinuationToken: token,
    });
    const contents = page.Contents || page.contents || [];
    for (const obj of contents) {
      const key = String(obj.Key || obj.key || '');
      if (!key.endsWith('/')) continue;
      let metadata = {};
      if (typeof opts.s3.headObject === 'function') {
        try {
          const head = await opts.s3.headObject({ Bucket: bucket, Key: key });
          metadata = head.Metadata || head.metadata || {};
        } catch {
          metadata = {};
        }
      }
      out.push({ key, metadata });
    }
    token = page.NextContinuationToken || page.nextContinuationToken;
  } while (token);
  return out;
}

/**
 * Idempotent Merc import: write missing merc-manual rows only.
 * @param {{
 *   s3: object,
 *   bucket?: string,
 *   dryRun?: boolean,
 *   mercRows: Array<object>,
 * }} opts
 */
async function importMercApplications(opts) {
  const existing = await listApplicationRecords(opts);
  const byMid = new Set();
  const bySlug = new Set();
  for (const row of existing) {
    const m = row.metadata || {};
    if (m.mid) byMid.add(String(m.mid));
    if (m.slug) bySlug.add(String(m.slug).toLowerCase());
    const keyTail = row.key
      .replace(PREFIX, '')
      .replace(/\/$/, '')
      .toLowerCase();
    if (keyTail) bySlug.add(keyTail);
  }
  const written = [];
  const skipped = [];
  for (const row of opts.mercRows || []) {
    const mid = String(row.mid || '').trim();
    const slug = String(row.slug || '').toLowerCase();
    if ((mid && byMid.has(mid)) || (slug && bySlug.has(slug))) {
      skipped.push(mid || slug);
      continue;
    }
    const result = await writeApplicationRecord({
      s3: opts.s3,
      bucket: opts.bucket,
      dryRun: opts.dryRun,
      record: row,
    });
    written.push(result.key);
    if (mid) byMid.add(mid);
    if (slug) bySlug.add(slug);
  }
  return { written, skipped };
}

module.exports = {
  PREFIX,
  applicationKey,
  toMeta,
  writeApplicationRecord,
  listApplicationRecords,
  importMercApplications,
};
