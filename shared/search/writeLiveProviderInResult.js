'use strict';

/**
 * FR #4038 / #4030: live provider workers write a-clubs IN/ when hostkey+guid present.
 * Legacy SQS msgs (userId/catalogId/searchId only) still use writeResults.
 */

const { writeInResultToS3 } = require('./writeInResultS3');
const { writeResults } = require('../writeResults');
const { touchLastmod: defaultTouchLastmod } = require('../widgets/hostFolderMeta');

/**
 * @param {Record<string, string|undefined>} envVars
 * @returns {string}
 */
function resolveAClubsBucket(envVars) {
  const env = envVars || {};
  for (const k of ['A_CLUBS_BUCKET', 'S3_ACLUBS_BUCKET', 'S3_A_CLUBS_BUCKET']) {
    const v = env[k] != null ? String(env[k]).trim() : '';
    if (v) return v;
  }
  return 'a-clubs';
}

/**
 * @param {object} msg
 * @returns {{ hostkey: string, guid: string, searchid: string }|null}
 */
function resolveInPathFromMsg(msg) {
  const hostkey = String((msg && (msg.hostkey || msg.host)) || '').trim();
  const guid = String((msg && (msg.guid || msg.widgetGuid)) || '').trim();
  const searchid = String((msg && (msg.searchid || msg.searchId)) || '').trim();
  if (!hostkey || !guid || !searchid) return null;
  return { hostkey, guid, searchid };
}

/**
 * @param {{
 *   msg: object,
 *   source: string,
 *   products?: object[],
 *   queries?: unknown[],
 *   exclude?: unknown[],
 *   error?: string,
 *   envVars?: Record<string, string|undefined>,
 *   putObject?: Function,
 *   touchLastmod?: Function,
 *   headObject?: Function,
 *   getObject?: Function,
 *   copyObject?: Function,
 *   getObjectTagging?: Function,
 *   putObjectTagging?: Function,
 *   now?: Date|string|number,
 * }} opts
 */
async function writeLiveProviderInResult(opts) {
  if (!opts || !opts.msg || !opts.source) {
    throw new Error('writeLiveProviderInResult requires msg + source');
  }
  const envVars = opts.envVars || process.env;
  const msg = opts.msg;
  const pathParts = resolveInPathFromMsg(msg);

  // Legacy fan-out / unit fixtures without hostkey+guid keep results-bucket write.
  if (!pathParts) {
    const written = await writeResults({
      env: msg.env,
      source: String(opts.source).trim().toLowerCase(),
      userId: msg.userId,
      catalogId: msg.catalogId,
      searchId: msg.searchId || msg.searchid,
      products: Array.isArray(opts.products) ? opts.products : [],
      envVars,
      putObject: opts.putObject,
      getObject: opts.getObject,
    });
    return {
      bucket: written.bucket,
      key: written.key,
      body: written.body,
      legacyResults: true,
    };
  }

  const bucket = resolveAClubsBucket(envVars);
  if (typeof opts.putObject !== 'function') {
    throw new Error('putObject_required');
  }

  // FR #4441: touchLastmod -> readMarkerState/rewriteMarkerMetadata call
  // head/get/copy/tagging with Key only. Inject Bucket on every S3 fn, not just put.
  const withBucket = (fn) => {
    if (typeof fn !== 'function') return fn;
    return async (args) => {
      const a = args && typeof args === 'object' ? { ...args } : {};
      if (!a.Bucket) a.Bucket = bucket;
      return fn(a);
    };
  };

  const putObject = withBucket(opts.putObject);
  const headObject = withBucket(opts.headObject);
  const getObject = withBucket(opts.getObject);
  const copyObject = withBucket(opts.copyObject);
  const getObjectTagging = withBucket(opts.getObjectTagging);
  const putObjectTagging = withBucket(opts.putObjectTagging);

  const touch =
    typeof opts.touchLastmod === 'function' ? opts.touchLastmod : defaultTouchLastmod;

  const written = await writeInResultToS3({
    hostkey: pathParts.hostkey,
    guid: pathParts.guid,
    searchid: pathParts.searchid,
    source: String(opts.source).trim().toLowerCase(),
    products: Array.isArray(opts.products) ? opts.products : [],
    queries: opts.queries != null ? opts.queries : msg.queries,
    exclude: opts.exclude != null ? opts.exclude : msg.exclude,
    error: opts.error,
    putObject,
    touchLastmod: touch,
    headObject,
    getObject,
    copyObject,
    getObjectTagging,
    putObjectTagging,
    bucket,
    now: opts.now,
  });

  return {
    bucket,
    key: written.Key,
    body: written.body,
    legacyResults: false,
  };
}

module.exports = {
  writeLiveProviderInResult,
  resolveAClubsBucket,
  resolveInPathFromMsg,
};
