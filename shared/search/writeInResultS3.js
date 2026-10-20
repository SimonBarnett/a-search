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
  const body = buildInResult(opts);
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
    await opts.touchLastmod({ Key: `${body.hostkey}/${body.guid}/`, ...s3 });
    await opts.touchLastmod({ Key: `${body.hostkey}/`, ...s3 });
  }

  return { Key, body };
}

module.exports = {
  writeInResultToS3,
  validateInResult,
  inResultKey,
  buildInResult,
};
