'use strict';

/**
 * FR #3999 / FR #4176: download one affiliate feed, write dated + latest, bump
 * meta, retain N. Substitute {feedapikey}/{darwinhash}/{feedid} for the fetch
 * only; affiliate marker feedurl keeps placeholders.
 */

const {
  affiliateMarkerKey,
  providerMarkerKey,
  partsDatedKey,
  partsLatestKey,
  partsPrefix,
  extFromMeta,
  assertSlug,
} = require('../../shared/affiliates/keys');
const {
  mergeAffiliateMeta,
  coerceStringMap,
} = require('../../shared/affiliates/metadata');
const {
  pickDatedPartsKeysToDelete,
  DEFAULT_KEEP,
} = require('../../shared/affiliates/retention');
const {
  listFeedUrlPlaceholders,
  resolveFeedUrlForFetch,
} = require('./resolveFeedUrl');

/**
 * @param {Response| { ok: boolean, status: number, arrayBuffer?: Function, buffer?: Function, body?: Buffer }} res
 * @returns {Promise<Buffer>}
 */
async function readBody(res) {
  if (res.body && Buffer.isBuffer(res.body)) return res.body;
  if (typeof res.arrayBuffer === 'function') {
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }
  if (typeof res.buffer === 'function') {
    return Buffer.from(await res.buffer());
  }
  throw new Error('fetch_body_unavailable');
}

/**
 * @param {{
 *   s3: object,
 *   bucket: string,
 *   provider: string,
 *   affiliateId: string,
 *   affiliateMeta?: Record<string,string>,
 *   providerMeta?: Record<string,string>,
 *   fetchImpl?: Function,
 *   now?: Date,
 *   keep?: number,
 * }} opts
 * @returns {Promise<{ ok: boolean, affiliateId: string, size?: number, status?: string, error?: string, placeholdersResolved?: boolean }>}
 */
async function downloadOne(opts) {
  const provider = assertSlug(opts.provider, 'provider');
  const affiliateId = assertSlug(opts.affiliateId, 'affiliateid');
  const bucket = opts.bucket;
  const s3 = opts.s3;
  const now = opts.now || new Date();
  const keep = opts.keep != null ? opts.keep : DEFAULT_KEEP;
  const fetchImpl = opts.fetchImpl || globalThis.fetch;

  let meta = coerceStringMap(opts.affiliateMeta);
  if (!Object.keys(meta).length) {
    const head = await s3.headObject({
      Bucket: bucket,
      Key: affiliateMarkerKey(provider, affiliateId),
    });
    meta = coerceStringMap(head.Metadata);
  }

  const feedurl = meta.feedurl ? String(meta.feedurl) : '';
  if (!feedurl) {
    const patch = mergeAffiliateMeta(
      meta,
      {
        affiliateid: affiliateId,
        laststatus: 'missing_feedurl',
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
      ok: false,
      affiliateId,
      status: 'missing_feedurl',
      error: 'missing_feedurl',
    };
  }

  let providerMeta = coerceStringMap(opts.providerMeta);
  const needsProvider =
    listFeedUrlPlaceholders(feedurl).some((n) =>
      n === 'feedapikey' || n === 'darwinhash',
    );
  if (needsProvider && !Object.keys(providerMeta).length) {
    try {
      const head = await s3.headObject({
        Bucket: bucket,
        Key: providerMarkerKey(provider),
      });
      providerMeta = coerceStringMap(head.Metadata);
    } catch {
      providerMeta = Object.create(null);
    }
  }

  const resolved = resolveFeedUrlForFetch({
    feedurl,
    affiliateMeta: meta,
    providerMeta,
  });
  if (!resolved.ok) {
    const patch = mergeAffiliateMeta(
      meta,
      {
        affiliateid: affiliateId,
        laststatus: 'unresolved_placeholder',
        lastdownload: now.toISOString(),
      },
      { now },
    );
    // Keep placeholder feedurl; never stamp secrets onto affiliate marker.
    await s3.putObject({
      Bucket: bucket,
      Key: affiliateMarkerKey(provider, affiliateId),
      Body: Buffer.alloc(0),
      Metadata: patch,
    });
    return {
      ok: false,
      affiliateId,
      status: 'unresolved_placeholder',
      error: 'unresolved_placeholder',
      placeholdersResolved: false,
    };
  }

  const fetchUrl = resolved.fetchUrl;
  const ext = extFromMeta(meta);
  const yyyyMmDd = now.toISOString().slice(0, 10);

  try {
    const res = await fetchImpl(fetchUrl, {
      method: 'GET',
      redirect: 'follow',
    });
    if (!res || !res.ok) {
      const code = `http_${res && res.status ? res.status : 'error'}`;
      const patch = mergeAffiliateMeta(
        meta,
        {
          affiliateid: affiliateId,
          laststatus: code,
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
        ok: false,
        affiliateId,
        status: code,
        error: code,
        placeholdersResolved: resolved.placeholdersResolved,
      };
    }

    const body = await readBody(res);
    const datedKey = partsDatedKey(provider, affiliateId, yyyyMmDd, ext);
    const latestKey = partsLatestKey(provider, affiliateId, ext);

    await s3.putObject({
      Bucket: bucket,
      Key: datedKey,
      Body: body,
      ContentType: 'application/octet-stream',
    });
    await s3.putObject({
      Bucket: bucket,
      Key: latestKey,
      Body: body,
      ContentType: 'application/octet-stream',
    });

    const listed = await s3.listObjectsV2({
      Bucket: bucket,
      Prefix: partsPrefix(provider, affiliateId),
    });
    const keys = (listed.Contents || []).map((c) => c.Key).filter(Boolean);
    const toDelete = pickDatedPartsKeysToDelete(keys, { keep });
    for (const Key of toDelete) {
      await s3.deleteObject({ Bucket: bucket, Key });
    }

    const patch = mergeAffiliateMeta(
      meta,
      {
        affiliateid: affiliateId,
        laststatus: 'ok',
        lastdownload: now.toISOString(),
        lastsize: String(body.length),
      },
      { now },
    );
    // feedurl in meta still has placeholders (merge keeps existing keys).
    await s3.putObject({
      Bucket: bucket,
      Key: affiliateMarkerKey(provider, affiliateId),
      Body: Buffer.alloc(0),
      Metadata: patch,
    });

    return {
      ok: true,
      affiliateId,
      size: body.length,
      status: 'ok',
      placeholdersResolved: resolved.placeholdersResolved,
    };
  } catch (err) {
    const code = 'download_error';
    try {
      const patch = mergeAffiliateMeta(
        meta,
        {
          affiliateid: affiliateId,
          laststatus: code,
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
    } catch {
      // best-effort meta update
    }
    return {
      ok: false,
      affiliateId,
      status: code,
      error: code,
      placeholdersResolved: resolved.placeholdersResolved,
    };
  }
}

module.exports = {
  downloadOne,
  readBody,
  listFeedUrlPlaceholders,
  resolveFeedUrlForFetch,
};
