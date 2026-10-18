'use strict';

/**
 * FR #4040 / #4030 follow-up: after a live provider search, write a-clubs IN/
 * when the job carries hostkey+guid (agent fan-out), else legacy writeResults.
 * Wraps provider HTTP with backoff429 so 429 never fails straight to the DLQ.
 */

const { writeResults } = require('../writeResults');
const { writeInResultToS3 } = require('./writeInResultS3');
const { backoffFor429 } = require('./backoff429');
const { touchLastmod } = require('../widgets/hostFolderMeta');

/**
 * @param {unknown} err
 * @param {{
 *   changeMessageVisibility?: Function,
 *   receiptHandle?: string,
 * }} [deps]
 */
async function rethrowUnless429Backoff(err, deps = {}) {
  const headers =
    (err && err.headers) ||
    (err && err.response && err.response.headers) ||
    undefined;
  const b = backoffFor429({ err, headers });
  if (!b.is429) throw err;

  if (
    typeof deps.changeMessageVisibility === 'function' &&
    deps.receiptHandle
  ) {
    await deps.changeMessageVisibility(
      deps.receiptHandle,
      b.visibilityTimeout,
    );
  }

  const e = new Error('http_429_backoff');
  e.name = 'Http429BackoffError';
  e.code = 'http_429_backoff';
  e.retryable = true;
  e.visibilityTimeout = b.visibilityTimeout;
  e.cause = err;
  throw e;
}

/**
 * Run an async search fn; on 429 apply backoff then rethrow retryable.
 * @param {() => Promise<unknown>} searchFn
 * @param {object} [deps]
 */
async function runSearchWith429Backoff(searchFn, deps) {
  try {
    return await searchFn();
  } catch (err) {
    await rethrowUnless429Backoff(err, deps);
  }
}

/**
 * @param {{
 *   msg: object,
 *   source: string,
 *   products: object[],
 *   envVars?: Record<string, string|undefined>,
 *   putObject?: Function,
 *   touchLastmod?: Function,
 *   headObject?: Function,
 *   getObject?: Function,
 *   copyObject?: Function,
 *   getObjectTagging?: Function,
 *   putObjectTagging?: Function,
 *   writeResults?: Function,
 *   writeInResultToS3?: Function,
 * }} opts
 */
async function finishProviderSearch(opts) {
  if (!opts || !opts.msg || typeof opts.msg !== 'object') {
    throw new Error('finishProviderSearch msg required');
  }
  const msg = opts.msg;
  const source = String(opts.source || msg.source || '').trim();
  if (!source) throw new Error('source_required');
  const products = Array.isArray(opts.products) ? opts.products : [];
  const envVars = opts.envVars || process.env;

  const hostkey = String(msg.hostkey || msg.host || '')
    .trim()
    .toLowerCase();
  const guid = String(msg.guid || msg.widgetGuid || '').trim();
  const searchid = String(msg.searchid || msg.searchId || '').trim();

  if (hostkey && guid && searchid) {
    const writeIn = opts.writeInResultToS3 || writeInResultToS3;
    const touch = opts.touchLastmod || touchLastmod;
    const putObject =
      opts.putObject ||
      (async (args) => {
        const bucket =
          envVars.A_CLUBS_BUCKET || envVars.A_CLUBS_BUCKET_NAME || 'a-clubs';
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
        const client = new S3Client({});
        return client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: args.Key,
            Body: args.Body,
            ContentType: args.ContentType,
            ContentLength: args.ContentLength,
          }),
        );
      });
    const written = await writeIn({
      hostkey,
      guid,
      searchid,
      source,
      products,
      queries: msg.queries,
      exclude: msg.exclude,
      putObject,
      touchLastmod: touch,
      headObject: opts.headObject,
      getObject: opts.getObject,
      copyObject: opts.copyObject,
      getObjectTagging: opts.getObjectTagging,
      putObjectTagging: opts.putObjectTagging,
    });
    return {
      ok: true,
      mode: 'a-clubs-in',
      source,
      searchId: searchid,
      searchid,
      key: written.Key,
      bucket: 'a-clubs',
      products,
    };
  }

  const write = opts.writeResults || writeResults;
  const written = await write({
    env: msg.env,
    source,
    userId: msg.userId,
    catalogId: msg.catalogId,
    searchId: msg.searchId || searchid,
    products,
    envVars,
    putObject: opts.putObject,
  });
  return {
    ok: true,
    mode: 'results-bucket',
    source,
    searchId: msg.searchId || searchid,
    key: written.key,
    bucket: written.bucket,
    products,
  };
}

module.exports = {
  finishProviderSearch,
  runSearchWith429Backoff,
  rethrowUnless429Backoff,
};
