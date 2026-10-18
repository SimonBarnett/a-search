'use strict';

/**
 * FR #4108 / #4195: folder-tools download --- wraps downloadOne with dry-run and
 * skip-if-today's feed exists (status=exists). Never logs feed URLs or secrets.
 */

const { downloadOne } = require('./downloadOne');
const {
  listFeedUrlPlaceholders,
  resolveFeedUrlForFetch,
} = require('./resolveFeedUrl');
const {
  affiliateMarkerKey,
  providerMarkerKey,
  assertSlug,
} = require('../../shared/affiliates/keys');
const {
  mergeAffiliateMeta,
  coerceStringMap,
} = require('../../shared/affiliates/metadata');
const {
  resolveFeedFormat,
  feedDatedKey,
} = require('../../shared/affiliates/feedFormat');

/**
 * @param {{
 *   s3: object,
 *   bucket: string,
 *   provider: string,
 *   affiliateId: string,
 *   affiliateMeta?: Record<string,string>,
 *   providerMeta?: Record<string,string>,
 *   force?: boolean,
 *   dryRun?: boolean,
 *   fetchImpl?: Function,
 *   now?: Date,
 * }} opts
 */
async function folderDownloadOne(opts) {
  const provider = assertSlug(opts.provider, 'provider');
  const affiliateId = assertSlug(opts.affiliateId, 'affiliateid');
  const bucket = opts.bucket;
  const s3 = opts.s3;
  const now = opts.now || new Date();
  const force = Boolean(opts.force);
  const dryRun = Boolean(opts.dryRun);

  let meta = coerceStringMap(opts.affiliateMeta);
  if (!Object.keys(meta).length) {
    const head = await s3.headObject({
      Bucket: bucket,
      Key: affiliateMarkerKey(provider, affiliateId),
    });
    meta = coerceStringMap(head.Metadata);
  }

  let providerMeta = coerceStringMap(opts.providerMeta);
  if (!Object.keys(providerMeta).length) {
    try {
      const pHead = await s3.headObject({
        Bucket: bucket,
        Key: providerMarkerKey(provider),
      });
      providerMeta = coerceStringMap(pHead.Metadata);
    } catch {
      providerMeta = Object.create(null);
    }
  }

  const feedurl = meta.feedurl ? String(meta.feedurl) : '';
  const fmt = resolveFeedFormat(meta, providerMeta);
  const yyyyMmDd = now.toISOString().slice(0, 10);
  const datedKey = fmt.ok
    ? feedDatedKey(provider, affiliateId, yyyyMmDd, fmt.ext)
    : null;

  if (dryRun) {
    let placeholdersResolved = false;
    if (feedurl && listFeedUrlPlaceholders(feedurl).length) {
      const resolved = resolveFeedUrlForFetch({
        feedurl,
        affiliateMeta: meta,
        providerMeta,
      });
      placeholdersResolved = Boolean(resolved.ok && resolved.placeholdersResolved);
    }
    if (!fmt.ok) {
      return {
        ok: false,
        provider,
        affiliateId,
        status: fmt.status,
        dryRun: true,
        force,
        feedurlSet: Boolean(feedurl),
        placeholdersResolved,
        format: String(meta.format || providerMeta.format || ''),
        compression: String(meta.compression || providerMeta.compression || ''),
        datedKey: null,
        key: null,
        size: null,
      };
    }
    return {
      ok: true,
      provider,
      affiliateId,
      status: 'dry_run',
      dryRun: true,
      force,
      feedurlSet: Boolean(feedurl),
      placeholdersResolved,
      format: fmt.format,
      compression: fmt.compression,
      datedKey,
      key: datedKey,
      size: null,
    };
  }

  if (!fmt.ok) {
    const patch = Object.assign({}, meta, {
      affiliateid: affiliateId,
      laststatus: fmt.status,
      lastdownload: now.toISOString(),
      lastmod: now.toISOString(),
    });
    await s3.putObject({
      Bucket: bucket,
      Key: affiliateMarkerKey(provider, affiliateId),
      Body: Buffer.alloc(0),
      Metadata: patch,
    });
    return {
      ok: false,
      provider,
      affiliateId,
      status: fmt.status,
      error: fmt.status,
    };
  }

  if (!feedurl) {
    const patch = Object.assign({}, meta, {
      affiliateid: affiliateId,
      laststatus: 'missing_feedurl',
      lastdownload: now.toISOString(),
      lastmod: now.toISOString(),
    });
    try {
      await s3.putObject({
        Bucket: bucket,
        Key: affiliateMarkerKey(provider, affiliateId),
        Body: Buffer.alloc(0),
        Metadata: patch,
      });
    } catch {
      // best-effort
    }
    return {
      ok: false,
      provider,
      affiliateId,
      status: 'missing_feedurl',
      error: 'missing_feedurl',
    };
  }

  const r = await downloadOne({
    s3,
    bucket,
    provider,
    affiliateId,
    affiliateMeta: meta,
    providerMeta,
    fetchImpl: opts.fetchImpl,
    now,
    force,
  });
  return {
    provider,
    datedKey: r.datedKey || datedKey,
    key: r.key || r.datedKey || datedKey,
    ...r,
  };
}

/**
 * JSON-safe summary for CLI / logs --- never includes feedurl or secrets.
 * @param {object} r
 */
function redactResult(r) {
  return {
    ok: Boolean(r && r.ok),
    provider: (r && r.provider) || null,
    affiliateId: (r && r.affiliateId) || null,
    status: (r && r.status) || null,
    skipped: Boolean(r && r.skipped),
    dryRun: Boolean(r && r.dryRun),
    force: Boolean(r && r.force),
    feedurlSet: Boolean(r && r.feedurlSet),
    placeholdersResolved:
      r && r.placeholdersResolved != null
        ? Boolean(r.placeholdersResolved)
        : null,
    format: (r && r.format) || null,
    compression: (r && r.compression) || null,
    datedKey: (r && r.datedKey) || null,
    key: (r && r.key) || (r && r.datedKey) || null,
    size: r && r.size != null ? r.size : null,
    error: (r && r.error) || null,
  };
}

module.exports = {
  folderDownloadOne,
  redactResult,
};
