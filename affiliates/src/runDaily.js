'use strict';

/**
 * FR #4195: daily orchestration --- enabled providers/affiliates whose last
 * successful download (lastok) is >= refreshdays (default 7) old, or never
 * downloaded. Failed downloads do not move lastok. Paginate listObjectsV2.
 */

const { downloadOne } = require('./downloadOne');
const { coerceStringMap } = require('../../shared/affiliates/metadata');
const {
  needsRefresh,
  refreshDaysFromMeta,
} = require('../../shared/affiliates/feedFormat');

/**
 * @param {object} s3
 * @param {string} bucket
 * @param {object} [base]
 * @returns {Promise<object>}
 */
async function listAllPages(s3, bucket, base) {
  const out = { CommonPrefixes: [], Contents: [] };
  let token;
  do {
    const page = await s3.listObjectsV2({
      Bucket: bucket,
      ...base,
      ContinuationToken: token,
    });
    for (const cp of page.CommonPrefixes || []) out.CommonPrefixes.push(cp);
    for (const c of page.Contents || []) out.Contents.push(c);
    token = page.IsTruncated ? page.NextContinuationToken : null;
  } while (token);
  return out;
}

/**
 * @param {object} s3
 * @param {string} bucket
 * @returns {Promise<string[]>}
 */
async function listProviderSlugs(s3, bucket) {
  const listed = await listAllPages(s3, bucket, { Delimiter: '/' });
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

/**
 * @param {object} s3
 * @param {string} bucket
 * @param {string} provider
 * @returns {Promise<string[]>}
 */
async function listAffiliateIds(s3, bucket, provider) {
  const prefix = `${provider}/`;
  const listed = await listAllPages(s3, bucket, {
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

/**
 * @param {string} s
 * @returns {string}
 */
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {{
 *   s3: object,
 *   bucket: string,
 *   fetchImpl?: Function,
 *   now?: Date,
 *   log?: Function,
 *   onImport?: Function,
 * }} opts
 */
async function runDaily(opts) {
  const s3 = opts.s3;
  const bucket = opts.bucket;
  const log = opts.log || ((msg) => console.log(msg));
  const now = opts.now || new Date();

  const providers = await listProviderSlugs(s3, bucket);
  /** @type {object[]} */
  const results = [];
  let ok = 0;
  let failed = 0;
  let affiliates = 0;
  let skippedFresh = 0;
  let skippedDisabled = 0;

  for (const provider of providers) {
    let providerMeta = Object.create(null);
    try {
      const pHead = await s3.headObject({
        Bucket: bucket,
        Key: `${provider}/`,
      });
      providerMeta = coerceStringMap(pHead.Metadata);
    } catch {
      providerMeta = Object.create(null);
    }

    if (String(providerMeta.enabled || '1') === '0') {
      log(`provider ${provider} skip: disabled`);
      skippedDisabled += 1;
      continue;
    }

    const refreshDays = refreshDaysFromMeta(providerMeta);
    const affiliateIds = await listAffiliateIds(s3, bucket, provider);

    for (const affiliateId of affiliateIds) {
      affiliates += 1;
      let meta = Object.create(null);
      try {
        const head = await s3.headObject({
          Bucket: bucket,
          Key: `${provider}/${affiliateId}/`,
        });
        meta = coerceStringMap(head.Metadata);
      } catch {
        log(`affiliate ${affiliateId} skip: marker_missing`);
        failed += 1;
        results.push({
          provider,
          affiliateId,
          ok: false,
          status: 'marker_missing',
        });
        continue;
      }

      if (String(meta.enabled || '1') === '0') {
        log(`affiliate ${affiliateId} skip: disabled`);
        results.push({
          provider,
          affiliateId,
          ok: false,
          status: 'disabled',
          skipped: true,
        });
        continue;
      }

      if (!needsRefresh(meta, now, refreshDays)) {
        skippedFresh += 1;
        log(`affiliate ${affiliateId} skip: fresh`);
        results.push({
          provider,
          affiliateId,
          ok: true,
          status: 'fresh',
          skipped: true,
        });
        continue;
      }

      try {
        const r = await downloadOne({
          s3,
          bucket,
          provider,
          affiliateId,
          affiliateMeta: meta,
          providerMeta,
          fetchImpl: opts.fetchImpl,
          now,
        });
        if (r.ok && r.status === 'ok') {
          ok += 1;
          log(`affiliate ${affiliateId} ok size=${r.size || 0}`);
        } else if (r.ok && r.status === 'exists') {
          ok += 1;
          log(`affiliate ${affiliateId} exists`);
        } else {
          failed += 1;
          log(`affiliate ${affiliateId} fail status=${r.status || 'error'}`);
        }
        results.push({ provider, ...r });
      } catch {
        failed += 1;
        log(`affiliate ${affiliateId} fail status=unhandled`);
        results.push({
          provider,
          affiliateId,
          ok: false,
          status: 'unhandled',
        });
      }
    }
  }

  const summary = {
    providers: providers.length,
    affiliates,
    ok,
    failed,
    skippedFresh,
    skippedDisabled,
    results,
  };

  if (typeof opts.onImport === 'function') {
    try {
      await opts.onImport(summary);
    } catch {
      log('import_hook_failed');
    }
  }

  return summary;
}

/** @deprecated use runDaily — kept for handler / tests */
async function runWeekly(opts) {
  return runDaily(opts);
}

module.exports = {
  runDaily,
  runWeekly,
  listProviderSlugs,
  listAffiliateIds,
  needsRefresh,
  refreshDaysFromMeta,
};
