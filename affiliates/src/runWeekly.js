'use strict';

/**
 * FR #3999: weekly orchestration — list providers/affiliates, download enabled.
 * One affiliate failure must not stop others. Log affiliate id only (no secrets).
 */

const { downloadOne } = require('./downloadOne');
const { coerceStringMap } = require('../../shared/affiliates/metadata');
const {
  enqueueImportAfterDownload,
} = require('../../redqueen/affiliate-import/src/enqueueImport');

/**
 * @param {object} s3
 * @param {string} bucket
 * @returns {Promise<string[]>}
 */
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

/**
 * @param {object} s3
 * @param {string} bucket
 * @param {string} provider
 * @returns {Promise<string[]>}
 */
async function listAffiliateIds(s3, bucket, provider) {
  const prefix = `${provider}/`;
  const listed = await s3.listObjectsV2({
    Bucket: bucket,
    Prefix: prefix,
    Delimiter: '/',
  });
  const ids = new Set();
  for (const cp of listed.CommonPrefixes || []) {
    const p = String(cp.Prefix || '');
    const m = new RegExp(`^${escapeRe(provider)}/([a-z0-9._-]+)/$`).exec(p);
    if (m) ids.add(m[1]);
  }
  for (const c of listed.Contents || []) {
    const k = String(c.Key || '');
    const m = new RegExp(`^${escapeRe(provider)}/([a-z0-9._-]+)/$`).exec(k);
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
 *   keep?: number,
 *   log?: Function,
 * }} opts
 * @returns {Promise<{ providers: number, affiliates: number, ok: number, failed: number, results: object[] }>}
 */
async function runWeekly(opts) {
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

  for (const provider of providers) {
    // FR #4176: load provider marker once per provider (feedapikey / darwinhash).
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
      } catch (err) {
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
          keep: opts.keep,
        });
        if (r.ok) {
          ok += 1;
          log(`affiliate ${affiliateId} ok size=${r.size || 0}`);
        } else {
          failed += 1;
          log(`affiliate ${affiliateId} fail status=${r.status || 'error'}`);
        }
        results.push({ provider, ...r });
      } catch (err) {
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

  // FR #4196: one import SQS message listing files written; empty run -> none.
  const written = [];
  for (const r of results) {
    if (!r || !r.ok) continue;
    const key = r.datedKey || r.key || null;
    if (!key) continue;
    written.push({
      provider: r.provider,
      affiliateid: r.affiliateId,
      key,
    });
  }
  let importEnqueue = { sent: false, skipped: 'none' };
  if (typeof opts.enqueueImport === 'function') {
    importEnqueue = await opts.enqueueImport({ files: written, results });
  } else if (written.length) {
    importEnqueue = await enqueueImportAfterDownload({
      files: written,
      runId: opts.runId,
      at: now,
      queueUrl: opts.importQueueUrl,
      sendMessage: opts.sendImportMessage,
      notifyUrl: opts.importNotifyUrl,
      fetchImpl: opts.fetchImpl,
      log,
    });
  } else {
    importEnqueue = { sent: false, skipped: 'empty' };
  }

  return {
    providers: providers.length,
    affiliates,
    ok,
    failed,
    results,
    importEnqueue,
  };
}

module.exports = {
  runWeekly,
  listProviderSlugs,
  listAffiliateIds,
};
