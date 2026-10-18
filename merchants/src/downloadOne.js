'use strict';

/**
 * FR #4008: download one merchant catalogue, write dated parts, bump meta, retain N.
 * Never overwrites an existing unprocessed dated parts file for that day.
 */

const {
  merchantMarkerKey,
  partsDatedKey,
  partsPrefix,
  extFromMeta,
  assertSlug,
} = require('../../shared/merchants/keys');
const {
  mergeMerchantMeta,
  coerceStringMap,
} = require('../../shared/merchants/metadata');
const {
  pickDatedPartsKeysToDelete,
  DEFAULT_KEEP,
} = require('../../shared/merchants/retention');

async function readBody(res) {
  if (res.body && Buffer.isBuffer(res.body)) return res.body;
  if (typeof res.arrayBuffer === 'function') {
    return Buffer.from(await res.arrayBuffer());
  }
  if (typeof res.buffer === 'function') {
    return Buffer.from(await res.buffer());
  }
  if (typeof res.json === 'function') {
    return Buffer.from(JSON.stringify(await res.json()), 'utf8');
  }
  throw new Error('fetch_body_unavailable');
}

function linkNextUrl(res) {
  const headers = res && res.headers;
  if (!headers || typeof headers.get !== 'function') return null;
  const link = headers.get('link') || headers.get('Link');
  if (!link) return null;
  const m = /<([^>]+)>\s*;\s*rel="?next"?/i.exec(String(link));
  return m ? m[1] : null;
}

async function fetchShopifyProductsJsonl(opts) {
  const domain = String(opts.shopdomain || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '');
  const version = String(opts.apiversion || '2024-10').trim() || '2024-10';
  const base =
    (opts.apibase && String(opts.apibase).trim()) ||
    `https://${domain}/admin/api/${version}`;
  let url = `${base.replace(/\/$/, '')}/products.json?limit=250`;
  const lines = [];

  for (let page = 0; page < 100; page += 1) {
    const res = await opts.fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'X-Shopify-Access-Token': opts.accesstoken,
        Accept: 'application/json',
      },
    });
    if (!res || !res.ok) {
      const code = `http_${res && res.status ? res.status : 'error'}`;
      const err = new Error(code);
      err.code = code;
      throw err;
    }
    let data;
    if (typeof res.json === 'function') {
      data = await res.json();
    } else {
      const buf = await readBody(res);
      data = JSON.parse(buf.toString('utf8'));
    }
    const products = (data && data.products) || [];
    for (const p of products) {
      lines.push(JSON.stringify(p));
    }
    const next = linkNextUrl(res);
    if (!next) break;
    url = next;
  }

  return Buffer.from(`${lines.join('\n')}${lines.length ? '\n' : ''}`, 'utf8');
}

async function downloadOne(opts) {
  const provider = assertSlug(opts.provider, 'provider');
  const merchantId = assertSlug(opts.merchantId, 'merchantid');
  const bucket = opts.bucket;
  const s3 = opts.s3;
  const now = opts.now || new Date();
  const keep = opts.keep != null ? opts.keep : DEFAULT_KEEP;
  const fetchImpl = opts.fetchImpl || globalThis.fetch;

  let meta = coerceStringMap(opts.merchantMeta);
  if (!Object.keys(meta).length) {
    const head = await s3.headObject({
      Bucket: bucket,
      Key: merchantMarkerKey(provider, merchantId),
    });
    meta = coerceStringMap(head.Metadata);
  }

  let providerMeta = coerceStringMap(opts.providerMeta);
  if (!Object.keys(providerMeta).length) {
    try {
      const pHead = await s3.headObject({
        Bucket: bucket,
        Key: `${provider}/`,
      });
      providerMeta = coerceStringMap(pHead.Metadata);
    } catch {
      providerMeta = Object.create(null);
    }
  }

  const ext = extFromMeta(meta);
  const yyyyMmDd = now.toISOString().slice(0, 10);
  const datedKey = partsDatedKey(provider, merchantId, yyyyMmDd, ext);

  try {
    await s3.headObject({ Bucket: bucket, Key: datedKey });
    const patch = mergeMerchantMeta(
      meta,
      {
        merchantid: merchantId,
        laststatus: 'parts_exists',
        lastdownload: now.toISOString(),
      },
      { now },
    );
    await s3.putObject({
      Bucket: bucket,
      Key: merchantMarkerKey(provider, merchantId),
      Body: Buffer.alloc(0),
      Metadata: patch,
    });
    return {
      ok: false,
      merchantId,
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
        merchantId,
        status: 'head_error',
        error: 'head_error',
      };
    }
  }

  const feedurl = meta.feedurl ? String(meta.feedurl) : '';
  const shopdomain = meta.shopdomain ? String(meta.shopdomain) : '';
  const accesstoken = meta.accesstoken ? String(meta.accesstoken) : '';

  if (!feedurl && !(shopdomain && accesstoken)) {
    const patch = mergeMerchantMeta(
      meta,
      {
        merchantid: merchantId,
        laststatus: 'missing_credentials',
        lastdownload: now.toISOString(),
      },
      { now },
    );
    await s3.putObject({
      Bucket: bucket,
      Key: merchantMarkerKey(provider, merchantId),
      Body: Buffer.alloc(0),
      Metadata: patch,
    });
    return {
      ok: false,
      merchantId,
      status: 'missing_credentials',
      error: 'missing_credentials',
    };
  }

  try {
    let body;
    if (feedurl) {
      const res = await fetchImpl(feedurl, {
        method: 'GET',
        redirect: 'follow',
      });
      if (!res || !res.ok) {
        const code = `http_${res && res.status ? res.status : 'error'}`;
        const patch = mergeMerchantMeta(
          meta,
          {
            merchantid: merchantId,
            laststatus: code,
            lastdownload: now.toISOString(),
          },
          { now },
        );
        await s3.putObject({
          Bucket: bucket,
          Key: merchantMarkerKey(provider, merchantId),
          Body: Buffer.alloc(0),
          Metadata: patch,
        });
        return { ok: false, merchantId, status: code, error: code };
      }
      body = await readBody(res);
    } else {
      body = await fetchShopifyProductsJsonl({
        fetchImpl,
        shopdomain,
        accesstoken,
        apiversion: providerMeta.apiversion || meta.apiversion,
        apibase: providerMeta.apibase || meta.apibase,
      });
    }

    await s3.putObject({
      Bucket: bucket,
      Key: datedKey,
      Body: body,
      ContentType: 'application/octet-stream',
    });

    const listed = await s3.listObjectsV2({
      Bucket: bucket,
      Prefix: partsPrefix(provider, merchantId),
    });
    const keys = (listed.Contents || []).map((c) => c.Key).filter(Boolean);
    const toDelete = pickDatedPartsKeysToDelete(keys, { keep });
    for (const Key of toDelete) {
      await s3.deleteObject({ Bucket: bucket, Key });
    }

    const patch = mergeMerchantMeta(
      meta,
      {
        merchantid: merchantId,
        laststatus: 'ok',
        lastdownload: now.toISOString(),
        lastsize: String(body.length),
      },
      { now },
    );
    await s3.putObject({
      Bucket: bucket,
      Key: merchantMarkerKey(provider, merchantId),
      Body: Buffer.alloc(0),
      Metadata: patch,
    });

    return { ok: true, merchantId, size: body.length, status: 'ok' };
  } catch (err) {
    const code =
      (err && err.code) ||
      (err && err.message && /^http_\d+/.test(err.message) ? err.message : null) ||
      'download_error';
    try {
      const patch = mergeMerchantMeta(
        meta,
        {
          merchantid: merchantId,
          laststatus: code,
          lastdownload: now.toISOString(),
        },
        { now },
      );
      await s3.putObject({
        Bucket: bucket,
        Key: merchantMarkerKey(provider, merchantId),
        Body: Buffer.alloc(0),
        Metadata: patch,
      });
    } catch {
      // best-effort meta update
    }
    return {
      ok: false,
      merchantId,
      status: code,
      error: code,
    };
  }
}

module.exports = {
  downloadOne,
  readBody,
  fetchShopifyProductsJsonl,
};
