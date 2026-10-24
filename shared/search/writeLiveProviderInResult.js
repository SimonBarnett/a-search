'use strict';

/**
 * FR #4038 / #4030: live provider workers write a-clubs IN/ when hostkey+guid present.
 * FR #4823: skip IN/ (and legacy results put) when products.length === 0; log only.
 * Legacy SQS msgs (userId/catalogId/searchId only) still use writeResults when products exist.
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
/**
 * @param {{ msg: object, source: string, logInfo?: Function }} opts
 */
function logProviderDoneZero(opts) {
  const msg = opts.msg || {};
  const pathParts = resolveInPathFromMsg(msg);
  const source = String(opts.source || '').trim().toLowerCase();
  const searchid = pathParts
    ? pathParts.searchid
    : String((msg.searchid != null ? msg.searchid : msg.searchId) || '').trim();
  const host = pathParts
    ? pathParts.hostkey
    : String((msg.hostkey || msg.host) || '').trim();
  const guid = pathParts
    ? pathParts.guid
    : String((msg.guid || msg.widgetGuid) || '').trim();
  const log =
    typeof opts.logInfo === 'function' ? opts.logInfo : console.log.bind(console);
  log(
    '[a-search]',
    'INFO',
    'provider_done',
    'source=' + source,
    'searchid=' + searchid,
    'host=' + host,
    'guid=' + guid,
    'products=0',
  );
}

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
 *   status?: object,
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
  const products = Array.isArray(opts.products) ? opts.products : [];

  if (products.length === 0) {
    logProviderDoneZero({ msg, source: opts.source, logInfo: opts.logInfo });
    const bucket = pathParts ? resolveAClubsBucket(envVars) : null;
    return {
      bucket,
      key: null,
      body: null,
      legacyResults: !pathParts,
      skipped: 'no_products',
    };
  }

  // Legacy fan-out / unit fixtures without hostkey+guid keep results-bucket write.
  if (!pathParts) {
    const written = await writeResults({
      env: msg.env,
      source: String(opts.source).trim().toLowerCase(),
      userId: msg.userId,
      catalogId: msg.catalogId,
      searchId: msg.searchId || msg.searchid,
      products,
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
    products,
    queries: opts.queries != null ? opts.queries : msg.queries,
    exclude: opts.exclude != null ? opts.exclude : msg.exclude,
    // FR #4562: optional vendor status (e.g. paapi_non_json) on IN body.
    status: opts.status,
    // FR #4561: error string for missing_credentials / non-retryable skips.
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
  logProviderDoneZero,
  resolveAClubsBucket,
  resolveInPathFromMsg,
};
