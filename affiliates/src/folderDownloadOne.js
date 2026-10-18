'use strict';

/**
 * FR #4108: folder-tools download path --- wraps downloadOne with dry-run and
 * skip-if-today's-dated-parts-exists (align merchants downloadAffiliateOne).
 * Never logs feed URLs or secrets.
 */

const { downloadOne } = require('./downloadOne');
const {
  enqueueImportAfterDownload,
} = require('../../redqueen/affiliate-import/src/enqueueImport');
const {
  listFeedUrlPlaceholders,
  resolveFeedUrlForFetch,
} = require('./resolveFeedUrl');
const {
  affiliateMarkerKey,
  providerMarkerKey,
  partsDatedKey,
  extFromMeta,
  assertSlug,
} = require('../../shared/affiliates/keys');
const {
  mergeAffiliateMeta,
  coerceStringMap,
} = require('../../shared/affiliates/metadata');

/**
 * @param {{
 *   s3: object,
 *   bucket: string,
 *   provider: string,
 *   affiliateId: string,
 *   affiliateMeta?: Record<string,string>,
 *   force?: boolean,
 *   dryRun?: boolean,
 *   fetchImpl?: Function,
 *   now?: Date,
 *   keep?: number,
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

  const feedurl = meta.feedurl ? String(meta.feedurl) : '';
  const ext = feedurl ? extFromMeta(meta) : extFromMeta({ format: 'csv' });
  const yyyyMmDd = now.toISOString().slice(0, 10);
  const datedKey = partsDatedKey(provider, affiliateId, yyyyMmDd, ext);
  const latestKey = `${provider}/${affiliateId}/parts/latest.${ext}`;

  if (dryRun) {
    let placeholdersResolved = false;
    if (feedurl && listFeedUrlPlaceholders(feedurl).length) {
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
      const resolved = resolveFeedUrlForFetch({
        feedurl,
        affiliateMeta: meta,
        providerMeta,
      });
      placeholdersResolved = Boolean(resolved.ok && resolved.placeholdersResolved);
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
      format: String(meta.format || 'csv'),
      compression: String(meta.compression || 'none'),
      datedKey,
      latestKey,
      size: null,
    };
  }

  if (!feedurl) {
    // Best-effort marker bump without mergeAffiliateMeta (normalize requires feedurl/feedid).
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

  if (!force) {
    try {
      await s3.headObject({ Bucket: bucket, Key: datedKey });
      const patch = mergeAffiliateMeta(
        meta,
        {
          affiliateid: affiliateId,
          laststatus: 'parts_exists',
          lastdownload: now.toISOString(),
        },
        { now },
      );
      await s3.putObject({
        Bucket: bucket,
        Key: affiliateMarkerKey(provider, affiliateId),
        Body: Buffer.alloc(0),
        Metadata: patch,
      });
      return {
        ok: true,
        provider,
        affiliateId,
        status: 'parts_exists',
        skipped: true,
        datedKey,
        size: null,
      };
    } catch (err) {
      const code = err && (err.name || err.code || '');
      const status = err && err.$metadata && err.$metadata.httpStatusCode;
      if (code !== 'NotFound' && code !== 'NoSuchKey' && status !== 404) {
        throw err;
      }
      // dated parts missing --- fall through to downloadOne
    }
  }

  const r = await downloadOne({
    s3,
    bucket,
    provider,
    affiliateId,
    affiliateMeta: meta,
    providerMeta: opts.providerMeta,
    fetchImpl: opts.fetchImpl,
    now,
    keep: opts.keep,
  });
  const out = {
    provider,
    datedKey,
    latestKey,
    ...r,
  };
  // FR #4196: manual first-run download fires the same one-file import message.
  if (out.ok && !out.skipped && !out.dryRun && opts.enqueueImport !== false) {
    const key = out.datedKey || out.key || datedKey;
    if (key) {
      out.importEnqueue = await enqueueImportAfterDownload({
        files: [
          {
            provider,
            affiliateid: affiliateId,
            key,
          },
        ],
        runId: opts.runId,
        at: now,
        queueUrl: opts.importQueueUrl,
        sendMessage: opts.sendImportMessage,
        notifyUrl: opts.importNotifyUrl,
        fetchImpl: opts.fetchImpl,
      });
    }
  }
  return out;
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
    latestKey: (r && r.latestKey) || null,
    size: r && r.size != null ? r.size : null,
    error: (r && r.error) || null,
  };
}

module.exports = {
  folderDownloadOne,
  redactResult,
};
