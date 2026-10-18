'use strict';

/**
 * DEPRECATED (FR #4269): scheduled dual-bucket job now requires
 * affiliates/src/downloadOne (placeholders + flat dated keys). Kept only for
 * historical reference / local experiments --- do not wire from runWeekly.
 */

const SLUG_RE = /^[a-z0-9._-]+$/;

function assertSlug(value, label) {
  const s = value == null ? '' : String(value).trim().toLowerCase();
  if (!s || !SLUG_RE.test(s) || s === '.' || s === '..' || s.includes('..')) {
    const err = new Error(`invalid_${label}`);
    err.code = `invalid_${label}`;
    throw err;
  }
  return s;
}

function extFromAffiliateMeta(meta) {
  const format = String((meta && meta.format) || 'csv')
    .trim()
    .toLowerCase();
  const compression = String((meta && meta.compression) || 'none')
    .trim()
    .toLowerCase();
  if (compression === 'gzip') return `${format}.gz`;
  if (compression === 'zip') return `${format}.zip`;
  return format;
}

function mergeMeta(existing, patch, now) {
  const out = Object.create(null);
  for (const [k, v] of Object.entries(existing || {})) {
    if (v != null) out[String(k).toLowerCase()] = String(v);
  }
  for (const [k, v] of Object.entries(patch || {})) {
    if (v != null) out[String(k).toLowerCase()] = String(v);
  }
  out.lastmod = now.toISOString();
  return out;
}

async function readBody(res) {
  if (res.body && Buffer.isBuffer(res.body)) return res.body;
  if (typeof res.arrayBuffer === 'function') {
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error('fetch_body_unavailable');
}

async function downloadAffiliateOne(opts) {
  const provider = assertSlug(opts.provider, 'provider');
  const affiliateId = assertSlug(opts.affiliateId, 'affiliateid');
  const bucket = opts.bucket;
  const s3 = opts.s3;
  const now = opts.now || new Date();
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const markerKey = `${provider}/${affiliateId}/`;

  let meta = Object.create(null);
  if (opts.affiliateMeta && typeof opts.affiliateMeta === 'object') {
    for (const [k, v] of Object.entries(opts.affiliateMeta)) {
      if (v != null) meta[String(k).toLowerCase()] = String(v);
    }
  } else {
    const head = await s3.headObject({ Bucket: bucket, Key: markerKey });
    for (const [k, v] of Object.entries(head.Metadata || {})) {
      meta[String(k).toLowerCase()] = String(v);
    }
  }

  const feedurl = meta.feedurl ? String(meta.feedurl) : '';
  if (!feedurl) {
    const patch = mergeMeta(
      meta,
      {
        affiliateid: affiliateId,
        laststatus: 'missing_feedurl',
        lastdownload: now.toISOString(),
      },
      now,
    );
    await s3.putObject({
      Bucket: bucket,
      Key: markerKey,
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

  const ext = extFromAffiliateMeta(meta);
  const yyyyMmDd = now.toISOString().slice(0, 10);
  const datedKey = `${provider}/${affiliateId}/parts/${yyyyMmDd}.${ext}`;

  try {
    await s3.headObject({ Bucket: bucket, Key: datedKey });
    const patch = mergeMeta(
      meta,
      {
        affiliateid: affiliateId,
        laststatus: 'parts_exists',
        lastdownload: now.toISOString(),
      },
      now,
    );
    await s3.putObject({
      Bucket: bucket,
      Key: markerKey,
      Body: Buffer.alloc(0),
      Metadata: patch,
    });
    return {
      ok: false,
      affiliateId,
      status: 'parts_exists',
      error: 'parts_exists',
      skipped: true,
    };
  } catch (err) {
    const missing =
      err &&
      (err.name === 'NotFound' ||
        err.code === 'NotFound' ||
        err.code === 'NoSuchKey' ||
        (err.$metadata && err.$metadata.httpStatusCode === 404));
    if (!missing) {
      return {
        ok: false,
        affiliateId,
        status: 'head_error',
        error: 'head_error',
      };
    }
  }

  try {
    const res = await fetchImpl(feedurl, { method: 'GET', redirect: 'follow' });
    if (!res || !res.ok) {
      const code = `http_${res && res.status ? res.status : 'error'}`;
      const patch = mergeMeta(
        meta,
        {
          affiliateid: affiliateId,
          laststatus: code,
          lastdownload: now.toISOString(),
        },
        now,
      );
      await s3.putObject({
        Bucket: bucket,
        Key: markerKey,
        Body: Buffer.alloc(0),
        Metadata: patch,
      });
      return { ok: false, affiliateId, status: code, error: code };
    }

    const body = await readBody(res);
    await s3.putObject({
      Bucket: bucket,
      Key: datedKey,
      Body: body,
      ContentType: 'application/octet-stream',
    });

    const patch = mergeMeta(
      meta,
      {
        affiliateid: affiliateId,
        laststatus: 'ok',
        lastdownload: now.toISOString(),
        lastsize: String(body.length),
      },
      now,
    );
    await s3.putObject({
      Bucket: bucket,
      Key: markerKey,
      Body: Buffer.alloc(0),
      Metadata: patch,
    });

    return { ok: true, affiliateId, size: body.length, status: 'ok' };
  } catch {
    const code = 'download_error';
    try {
      const patch = mergeMeta(
        meta,
        {
          affiliateid: affiliateId,
          laststatus: code,
          lastdownload: now.toISOString(),
        },
        now,
      );
      await s3.putObject({
        Bucket: bucket,
        Key: markerKey,
        Body: Buffer.alloc(0),
        Metadata: patch,
      });
    } catch {
      // best-effort
    }
    return { ok: false, affiliateId, status: code, error: code };
  }
}

module.exports = {
  downloadAffiliateOne,
};
