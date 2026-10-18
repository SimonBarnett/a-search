'use strict';

/**
 * Thin S3 helpers for a-clubs (injectable for tests).
 */

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isNotFound(err) {
  const status = err && err.$metadata && err.$metadata.httpStatusCode;
  const code = err && (err.name || err.code || err.Code);
  return (
    status === 404 ||
    code === 'NotFound' ||
    code === 'NoSuchKey' ||
    code === 'NotFound' ||
    code === '404'
  );
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isPreconditionFailed(err) {
  const status = err && err.$metadata && err.$metadata.httpStatusCode;
  const code = err && (err.name || err.code || err.Code);
  return (
    status === 412 ||
    code === 'PreconditionFailed' ||
    code === '412'
  );
}

/**
 * @param {{
 *   headObject: Function,
 *   Key: string,
 * }} opts
 * @returns {Promise<object|null>}
 */
async function headOrNull(opts) {
  try {
    return await opts.headObject({ Key: opts.Key });
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/**
 * Conditional create: If-None-Match: * (fails if object exists).
 * @param {{
 *   putObject: Function,
 *   Key: string,
 *   Body?: Buffer|string,
 *   Metadata?: Record<string, string>,
 *   ContentType?: string,
 *   Tagging?: string,
 * }} opts
 * @returns {Promise<{ created: boolean }>}
 */
async function putIfAbsent(opts) {
  const Body =
    opts.Body == null
      ? Buffer.alloc(0)
      : Buffer.isBuffer(opts.Body)
        ? opts.Body
        : Buffer.from(String(opts.Body), 'utf8');
  try {
    await opts.putObject({
      Key: opts.Key,
      Body,
      ContentLength: Body.length,
      IfNoneMatch: '*',
      ...(opts.Metadata ? { Metadata: opts.Metadata } : {}),
      ...(opts.ContentType ? { ContentType: opts.ContentType } : {}),
      ...(opts.Tagging ? { Tagging: opts.Tagging } : {}),
    });
    return { created: true };
  } catch (err) {
    if (isPreconditionFailed(err)) {
      return { created: false };
    }
    // Some mocks/SDKs surface existing object differently
    if (isNotFound(err)) throw err;
    const status = err && err.$metadata && err.$metadata.httpStatusCode;
    if (status === 409 || (err && (err.name === 'Conflict' || err.code === 'Conflict'))) {
      return { created: false };
    }
    throw err;
  }
}

module.exports = {
  isNotFound,
  isPreconditionFailed,
  headOrNull,
  putIfAbsent,
};
