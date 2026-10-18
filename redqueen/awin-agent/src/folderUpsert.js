'use strict';

/**
 * FR #4123: create or merge a-affiliates/awin/{advertiserid}/ markers.
 * Existing folders are merged (never recreated); last* download state kept.
 */

const {
  affiliateMarkerKey,
  assertSlug,
} = require('../../../shared/affiliates/keys');
const {
  mergeAffiliateMeta,
  coerceStringMap,
} = require('../../../shared/affiliates/metadata');

const PROVIDER = 'awin';

/**
 * @param {{
 *   s3: { headObject: Function, putObject: Function, copyObject?: Function },
 *   bucket: string,
 *   advertiserId: string,
 *   patch: Record<string, string>,
 *   now?: Date,
 *   dryRun?: boolean,
 * }} opts
 * @returns {Promise<{ action: 'created'|'updated'|'would_create'|'would_update', key: string, metadata: Record<string,string> }>}
 */
async function upsertAwinAffiliateFolder(opts) {
  const advertiserId = assertSlug(opts.advertiserId, 'affiliateid');
  const key = affiliateMarkerKey(PROVIDER, advertiserId);
  const bucket = opts.bucket || 'a-affiliates';
  const now = opts.now || new Date();
  const s3 = opts.s3;

  let existing = null;
  try {
    const head = await s3.headObject({ Bucket: bucket, Key: key });
    existing = coerceStringMap(head.Metadata || head.metadata);
  } catch (err) {
    const code = err && (err.code || err.name);
    const status = err && err.$metadata && err.$metadata.httpStatusCode;
    if (code !== 'NotFound' && code !== 'NoSuchKey' && status !== 404) {
      throw err;
    }
  }

  const base = existing || {};
  // Never reset last* download state from a sparse patch.
  const patch = { ...coerceStringMap(opts.patch) };
  for (const k of ['lastdownload', 'laststatus', 'lastsize']) {
    if (patch[k] == null || patch[k] === '') delete patch[k];
  }

  const id = advertiserId;
  const merged = mergeAffiliateMeta(
    base,
    {
      affiliateid: id,
      awinmid: id,
      schedule: base.schedule || patch.schedule || 'weekly',
      format: patch.format || base.format || 'csv',
      compression: patch.compression || base.compression || 'none',
      ...patch,
    },
    { now },
  );

  // Preserve last* if merge dropped them somehow.
  for (const k of ['lastdownload', 'laststatus', 'lastsize']) {
    if (base[k] && !merged[k]) merged[k] = base[k];
  }

  if (opts.dryRun) {
    return {
      action: existing ? 'would_update' : 'would_create',
      key,
      metadata: merged,
    };
  }

  // Prefer copy-object in place when supported; else putObject zero-byte.
  if (existing && typeof s3.copyObject === 'function') {
    await s3.copyObject({
      Bucket: bucket,
      CopySource: `${bucket}/${key}`,
      Key: key,
      Metadata: merged,
      MetadataDirective: 'REPLACE',
      ContentType: 'application/octet-stream',
    });
  } else {
    await s3.putObject({
      Bucket: bucket,
      Key: key,
      Body: Buffer.alloc(0),
      Metadata: merged,
    });
  }

  return {
    action: existing ? 'updated' : 'created',
    key,
    metadata: merged,
  };
}

/**
 * Approved advertiser with no feed: enabled=0, disabledreason=nofeed.
 * @param {object} opts same as upsert + name?
 */
async function markNoFeedFollowUp(opts) {
  return upsertAwinAffiliateFolder({
    ...opts,
    patch: {
      ...(opts.patch || {}),
      name: (opts.patch && opts.patch.name) || opts.advertiserId,
      enabled: '0',
      disabledreason: 'nofeed',
      laststatus: 'missing_feedurl',
    },
  });
}

module.exports = {
  PROVIDER,
  upsertAwinAffiliateFolder,
  markNoFeedFollowUp,
};
