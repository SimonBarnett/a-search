'use strict';

/**
 * FR #3999 / #4176 / #4195: download one affiliate feed into
 * {provider}/{affiliateid}/{yyyy-mm-dd}.{ext} (decompressed). No parts/, no
 * latest, no retention. Substitute {feedapikey}/{darwinhash}/{feedid} for the
 * fetch only; affiliate marker feedurl keeps placeholders.
 */

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
const {
  listFeedUrlPlaceholders,
  resolveFeedUrlForFetch,
} = require('./resolveFeedUrl');
const { decompressFeedBody } = require('./decompressFeed');

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
 * @param {object} s3
 * @param {string} bucket
 * @param {string} key
 * @param {Record<string, string>} meta
 */
async function stampMarker(s3, bucket, key, meta) {
  await s3.putObject({
    Bucket: bucket,
    Key: key,
    Body: Buffer.alloc(0),
    Metadata: meta,
  });
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
 *   force?: boolean,
 * }} opts
 */
async function downloadOne(opts) {
  const provider = assertSlug(opts.provider, 'provider');
  const affiliateId = assertSlug(opts.affiliateId, 'affiliateid');
  const bucket = opts.bucket;
  const s3 = opts.s3;
  const now = opts.now || new Date();
  const force = Boolean(opts.force);
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const markerKey = affiliateMarkerKey(provider, affiliateId);

  let meta = coerceStringMap(opts.affiliateMeta);
  if (!Object.keys(meta).length) {
    const head = await s3.headObject({
      Bucket: bucket,
      Key: markerKey,
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
    await stampMarker(s3, bucket, markerKey, patch);
    return {
      ok: false,
      affiliateId,
      status: 'missing_feedurl',
      error: 'missing_feedurl',
    };
  }

  let providerMeta = coerceStringMap(opts.providerMeta);
  // Load provider marker for format/compression fallbacks + feed secrets.
  if (!Object.keys(providerMeta).length) {
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

  const fmt = resolveFeedFormat(meta, providerMeta);
  if (!fmt.ok) {
    // Do not run normalizeAffiliateMeta --- invalid format/compression would throw.
    const patch = Object.assign({}, meta, {
      affiliateid: affiliateId,
      laststatus: fmt.status,
      lastdownload: now.toISOString(),
      lastmod: now.toISOString(),
    });
    await stampMarker(s3, bucket, markerKey, patch);
    return {
      ok: false,
      affiliateId,
      status: fmt.status,
      error: fmt.status,
    };
  }

  const yyyyMmDd = now.toISOString().slice(0, 10);
  const datedKey = feedDatedKey(provider, affiliateId, yyyyMmDd, fmt.ext);

  if (!force) {
    try {
      await s3.headObject({ Bucket: bucket, Key: datedKey });
      const patch = mergeAffiliateMeta(
        meta,
        {
          affiliateid: affiliateId,
          laststatus: 'exists',
          lastdownload: now.toISOString(),
        },
        { now },
      );
      await stampMarker(s3, bucket, markerKey, patch);
      return {
        ok: true,
        affiliateId,
        status: 'exists',
        skipped: true,
        key: datedKey,
        datedKey,
        size: null,
      };
    } catch (err) {
      const code = err && (err.name || err.code || '');
      const status = err && err.$metadata && err.$metadata.httpStatusCode;
      if (code !== 'NotFound' && code !== 'NoSuchKey' && status !== 404) {
        throw err;
      }
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
    await stampMarker(s3, bucket, markerKey, patch);
    return {
      ok: false,
      affiliateId,
      status: 'unresolved_placeholder',
      error: 'unresolved_placeholder',
      placeholdersResolved: false,
    };
  }

  const fetchUrl = resolved.fetchUrl;

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
      await stampMarker(s3, bucket, markerKey, patch);
      return {
        ok: false,
        affiliateId,
        status: code,
        error: code,
        placeholdersResolved: resolved.placeholdersResolved,
      };
    }

    const compressed = await readBody(res);
    const dec = await decompressFeedBody(compressed, {
      compression: fmt.compression,
      format: fmt.format,
    });
    if (!dec.ok) {
      const patch = mergeAffiliateMeta(
        meta,
        {
          affiliateid: affiliateId,
          laststatus: dec.status,
          lastdownload: now.toISOString(),
        },
        { now },
      );
      await stampMarker(s3, bucket, markerKey, patch);
      return {
        ok: false,
        affiliateId,
        status: dec.status,
        error: dec.status,
        placeholdersResolved: resolved.placeholdersResolved,
      };
    }

    const body = dec.buffer;
    await s3.putObject({
      Bucket: bucket,
      Key: datedKey,
      Body: body,
      ContentType: fmt.contentType,
      ContentLength: body.length,
    });

    const iso = now.toISOString();
    const patch = mergeAffiliateMeta(
      meta,
      {
        affiliateid: affiliateId,
        laststatus: 'ok',
        lastdownload: iso,
        lastok: iso,
        lastsize: String(body.length),
        format: fmt.format,
        compression: fmt.compression,
      },
      { now },
    );
    await stampMarker(s3, bucket, markerKey, patch);

    return {
      ok: true,
      affiliateId,
      size: body.length,
      status: 'ok',
      key: datedKey,
      datedKey,
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
      await stampMarker(s3, bucket, markerKey, patch);
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
