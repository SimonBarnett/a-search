'use strict';

/**
 * FR #4008 / #4269: daily orchestration across a-merchants (+ optional a-affiliates).
 * Only enabled=1 folders whose lastdownload is >= 7 days old. Affiliates reuse
 * affiliates/src/downloadOne (placeholders + flat dated keys). One entity failure
 * must not stop others. Log ids only (no secrets).
 */

const { downloadOne } = require('./downloadOne');
const {
  downloadOne: downloadAffiliateFeed,
} = require('../../affiliates/src/downloadOne');
const { coerceStringMap } = require('../../shared/merchants/metadata');

/** FR #4269: refresh cadence --- skip when lastdownload is newer than this. */
const STALE_DAYS = 7;
const STALE_DAYS_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Missing enabled is disabled (FR #4008 / #4269). */
function isEnabledOne(meta) {
  return String((meta && meta.enabled) || '') === '1';
}

/**
 * @param {Record<string, string>} meta
 * @param {Date} now
 */
function isLastdownloadStale(meta, now) {
  const raw = meta && (meta.lastdownload || meta.lastok);
  if (!raw) return true;
  const t = Date.parse(String(raw));
  if (Number.isNaN(t)) return true;
  return now.getTime() - t >= STALE_DAYS_MS;
}

async function listProviderSlugs(s3, bucket) {
  const listed = await s3.listObjectsV2({
    Bucket: bucket,
    Delimiter: '/',
  });
  const slugs = new Set();
  for (const cp of listed.CommonPrefixes || []) {
    const p = String(cp.Prefix || '');
    const m = /^([a-z0-9._-]+)\/$/.exec(p);
    if (m) slugs.add(m[1]);
  }
  for (const c of listed.Contents || []) {
    const k = String(c.Key || '');
    const m = /^([a-z0-9._-]+)\/$/.exec(k);
    if (m) slugs.add(m[1]);
  }
  return [...slugs].sort();
}

async function listChildIds(s3, bucket, provider) {
  const prefix = `${provider}/`;
  const listed = await s3.listObjectsV2({
    Bucket: bucket,
    Prefix: prefix,
    Delimiter: '/',
  });
  const ids = new Set();
  const re = new RegExp(`^${escapeRe(provider)}/([a-z0-9._-]+)/$`);
  for (const cp of listed.CommonPrefixes || []) {
    const p = String(cp.Prefix || '');
    const m = re.exec(p);
    if (m) ids.add(m[1]);
  }
  for (const c of listed.Contents || []) {
    const k = String(c.Key || '');
    const m = re.exec(k);
    if (m) ids.add(m[1]);
  }
  return [...ids].sort();
}

async function runBucket(opts) {
  const s3 = opts.s3;
  const bucket = opts.bucket;
  const log = opts.log || ((msg) => console.log(msg));
  const now = opts.now || new Date();
  const kind = opts.kind;
  const label = kind === 'affiliate' ? 'affiliate' : 'merchant';

  const providers = await listProviderSlugs(s3, bucket);
  /** @type {object[]} */
  const results = [];
  let ok = 0;
  let failed = 0;
  let entities = 0;

  for (const provider of providers) {
    const ids = await listChildIds(s3, bucket, provider);
    for (const id of ids) {
      entities += 1;
      let meta = Object.create(null);
      try {
        const head = await s3.headObject({
          Bucket: bucket,
          Key: `${provider}/${id}/`,
        });
        meta = coerceStringMap(head.Metadata);
      } catch {
        log(`${label} ${id} skip: marker_missing`);
        failed += 1;
        results.push({
          provider,
          [kind === 'affiliate' ? 'affiliateId' : 'merchantId']: id,
          ok: false,
          status: 'marker_missing',
        });
        continue;
      }

      if (!isEnabledOne(meta)) {
        log(`${label} ${id} skip: disabled`);
        results.push({
          provider,
          [kind === 'affiliate' ? 'affiliateId' : 'merchantId']: id,
          ok: false,
          status: 'disabled',
          skipped: true,
        });
        continue;
      }

      if (!isLastdownloadStale(meta, now)) {
        log(`${label} ${id} skip: not_stale`);
        results.push({
          provider,
          [kind === 'affiliate' ? 'affiliateId' : 'merchantId']: id,
          ok: false,
          status: 'not_stale',
          skipped: true,
        });
        continue;
      }

      try {
        let r;
        if (kind === 'affiliate') {
          r = await downloadAffiliateFeed({
            s3,
            bucket,
            provider,
            affiliateId: id,
            affiliateMeta: meta,
            fetchImpl: opts.fetchImpl,
            now,
          });
        } else {
          r = await downloadOne({
            s3,
            bucket,
            provider,
            merchantId: id,
            merchantMeta: meta,
            fetchImpl: opts.fetchImpl,
            now,
            keep: opts.keep,
          });
        }
        if (r.ok) {
          ok += 1;
          log(`${label} ${id} ok size=${r.size || 0}`);
        } else if (r.skipped) {
          log(`${label} ${id} skip status=${r.status || 'skipped'}`);
        } else {
          failed += 1;
          log(`${label} ${id} fail status=${r.status || 'error'}`);
        }
        results.push({ provider, ...r });
      } catch {
        failed += 1;
        log(`${label} ${id} fail status=unhandled`);
        results.push({
          provider,
          [kind === 'affiliate' ? 'affiliateId' : 'merchantId']: id,
          ok: false,
          status: 'unhandled',
        });
      }
    }
  }

  return {
    providers: providers.length,
    entities,
    ok,
    failed,
    results,
  };
}

async function runWeekly(opts) {
  const merchants = await runBucket({
    s3: opts.s3,
    bucket: opts.merchantsBucket,
    fetchImpl: opts.fetchImpl,
    now: opts.now,
    keep: opts.keep,
    log: opts.log,
    kind: 'merchant',
  });

  /** @type {{ providers: number, entities: number, ok: number, failed: number, results: object[] }} */
  let affiliates = {
    providers: 0,
    entities: 0,
    ok: 0,
    failed: 0,
    results: [],
  };

  const affBucket =
    opts.affiliatesBucket != null ? String(opts.affiliatesBucket).trim() : '';
  if (affBucket) {
    affiliates = await runBucket({
      s3: opts.s3,
      bucket: affBucket,
      fetchImpl: opts.fetchImpl,
      now: opts.now,
      keep: opts.keep,
      log: opts.log,
      kind: 'affiliate',
    });
  }

  return {
    merchants: {
      providers: merchants.providers,
      merchants: merchants.entities,
      ok: merchants.ok,
      failed: merchants.failed,
      results: merchants.results,
    },
    affiliates: {
      providers: affiliates.providers,
      affiliates: affiliates.entities,
      ok: affiliates.ok,
      failed: affiliates.failed,
      results: affiliates.results,
    },
  };
}

module.exports = {
  runWeekly,
  runBucket,
  listProviderSlugs,
  listChildIds,
  STALE_DAYS,
  STALE_DAYS_MS,
  isEnabledOne,
  isLastdownloadStale,
};
