'use strict';

/**
 * FR #4038 / #4030: live provider workers write a-clubs IN/ when hostkey+guid present.
 * FR #4823: skip IN/ (and legacy results put) when products.length === 0; log only.
 * Legacy SQS msgs (userId/catalogId/searchId only) still use writeResults when products exist.
 */

const { writeInResultToS3 } = require('./writeInResultS3');
const { writeResults } = require('../writeResults');
const { touchLastmod: defaultTouchLastmod } = require('../widgets/hostFolderMeta');
const { recordSearchTerminal } = require('./searchDone');

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
/**
 * FR #4917: write DONE/{searchid}-{source}.json status=serviced and maybe flip hasresults.
 * Fail-soft so IN/ success is never lost to a DONE write error.
 */
async function recordServicedDone(opts, pathParts, productsCount, s3Fns, bucket) {
  if (!pathParts || typeof s3Fns.putObject !== 'function') return null;
  try {
    return await recordSearchTerminal({
      hostkey: pathParts.hostkey,
      guid: pathParts.guid,
      searchid: pathParts.searchid,
      source: opts.source,
      status: 'serviced',
      products: productsCount,
      bucket,
      envVars: opts.envVars || process.env,
      now: opts.now,
      putObject: s3Fns.putObject,
      getObject: s3Fns.getObject,
      headObject: s3Fns.headObject,
      copyObject: s3Fns.copyObject,
      getObjectTagging: s3Fns.getObjectTagging,
      putObjectTagging: s3Fns.putObjectTagging,
      logError: opts.logError,
    });
  } catch (err) {
    const log =
      typeof opts.logError === 'function'
        ? opts.logError
        : console.error.bind(console);
    log(
      '[a-search]',
      'WARN',
      'search_done_write_failed',
      String((err && err.message) || err),
    );
    return null;
  }
}

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
    // FR #4917 / #4823: zero products still write DONE (never IN/).
    if (
      pathParts &&
      String(opts.source).trim().toLowerCase() === 'sql' &&
      typeof opts.deleteObject === 'function'
    ) {
      try {
        await opts.deleteObject({
          Bucket: resolveAClubsBucket(envVars),
          Key: `${pathParts.hostkey}/${pathParts.guid}/IN/sql.json`,
        });
      } catch (err) {
        const status = err && err.$metadata && err.$metadata.httpStatusCode;
        const code = err && (err.name || err.code);
        if (status !== 404 && code !== 'NoSuchKey' && code !== 'NotFound') {
          throw err;
        }
      }
    }
    if (pathParts && typeof opts.putObject === 'function') {
      const withBucket = (fn) => {
        if (typeof fn !== 'function') return fn;
        return async (args) => {
          const a = args && typeof args === 'object' ? { ...args } : {};
          if (!a.Bucket && bucket) a.Bucket = bucket;
          return fn(a);
        };
      };
      await recordServicedDone(
        opts,
        pathParts,
        0,
        {
          putObject: withBucket(opts.putObject),
          getObject: withBucket(opts.getObject),
          headObject: withBucket(opts.headObject),
          copyObject: withBucket(opts.copyObject),
          getObjectTagging: withBucket(opts.getObjectTagging),
          putObjectTagging: withBucket(opts.putObjectTagging),
        },
        bucket,
      );
    }
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

  // FR #4917: terminal DONE after a successful IN write.
  await recordServicedDone(
    opts,
    pathParts,
    products.length,
    {
      putObject,
      getObject,
      headObject,
      copyObject,
      getObjectTagging,
      putObjectTagging,
    },
    bucket,
  );

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
