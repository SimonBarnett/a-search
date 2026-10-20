'use strict';

/**
 * FR #4030: write validated IN/ JSON to a-clubs and bump GUID + host lastmod.
 */

const { inResultKey, buildInResult, validateInResult } = require('./inResultSchema');

/**
 * @param {{
 *   hostkey: string,
 *   guid: string,
 *   searchid: string,
 *   source: string,
 *   products?: object[],
 *   queries?: unknown[],
 *   exclude?: unknown[],
 *   status?: object,
 *   error?: string,
 *   putObject: Function,
 *   touchLastmod?: Function,
 *   headObject?: Function,
 *   getObject?: Function,
 *   copyObject?: Function,
 *   getObjectTagging?: Function,
 *   putObjectTagging?: Function,
 *   bucket?: string,
 *   now?: Date|string|number,
 * }} opts
 */
async function writeInResultToS3(opts) {
  if (!opts || typeof opts.putObject !== 'function') {
    throw new Error('putObject_required');
  }
  const body = buildInResult({
    hostkey: opts.hostkey,
    guid: opts.guid,
    searchid: opts.searchid,
    source: opts.source,
    products: opts.products,
    queries: opts.queries,
    exclude: opts.exclude,
    status: opts.status,
    error: opts.error,
  });
  const Key = inResultKey({
    hostkey: body.hostkey,
    guid: body.guid,
    searchid: body.searchid,
    source: body.source,
  });
  const Body = Buffer.from(`${JSON.stringify(body, null, 2)}\n`, 'utf8');
  await opts.putObject({
    Key,
    Body,
    ContentLength: Body.length,
    ContentType: 'application/json; charset=utf-8',
  });

  if (typeof opts.touchLastmod === 'function') {
    const s3 = {
      headObject: opts.headObject,
      getObject: opts.getObject,
      copyObject: opts.copyObject,
      putObject: opts.putObject,
      getObjectTagging: opts.getObjectTagging,
      putObjectTagging: opts.putObjectTagging,
      // FR #4441: CopySource in rewriteMarkerMetadata needs the real bucket name.
      bucket: opts.bucket,
      now: opts.now,
    };
    // FR #4559: IN/ JSON is the search result. Marker lastmod rewrite is best-effort ---
    // a 403/AccessDenied on CopyObject must not throw (else successful searches hit DLQ).
    const logWarn =
      typeof opts.log === 'function'
        ? opts.log
        : (msg) => {
            try {
              console.warn(msg);
            } catch {
              // ignore
            }
          };
    for (const markerKey of [
      `${body.hostkey}/${body.guid}/`,
      `${body.hostkey}/`,
    ]) {
      try {
        await opts.touchLastmod({ Key: markerKey, ...s3 });
      } catch (err) {
        const detail = err && err.message ? String(err.message) : String(err);
        logWarn(`touchLastmod_best_effort_failed key=${markerKey} ${detail}`);
      }
    }
  }

  return { Key, body };
}

module.exports = {
  writeInResultToS3,
  validateInResult,
  inResultKey,
  buildInResult,
};
