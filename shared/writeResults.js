'use strict';

/**
 * Shared worker results writer (FR-009 / FR-033).
 * PutObject to S3_RESULTS_BUCKET at the canonical results key.
 * When `putObject` is omitted, uses @aws-sdk/client-s3 PutObject
 * (override with `createS3Client` for tests).
 */

const { resultsKey, ResultsPathError } = require('./resultsPath');

/**
 * @param {{ createS3Client?: () => { send: Function } }} [deps]
 * @returns {(args: object) => Promise<unknown>}
 */
function defaultPutObject(deps) {
  return async (args) => {
    if (deps && typeof deps.createS3Client === 'function') {
      const client = deps.createS3Client();
      return client.send(args);
    }
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const client = new S3Client({});
    return client.send(new PutObjectCommand(args));
  };
}

/**
 * @param {{
 *   env: string,
 *   source: string,
 *   userId: string|number,
 *   catalogId: string|number,
 *   searchId: string,
 *   products?: unknown[],
 *   envVars?: Record<string, string|undefined>,
 *   putObject?: (args: {
 *     Bucket: string,
 *     Key: string,
 *     Body: string,
 *     ContentType: string,
 *   }) => Promise<unknown>,
 *   createS3Client?: () => { send: Function },
 * }} opts
 * @returns {Promise<{ bucket: string, key: string, body: object }>}
 */
async function writeResults(opts) {
  const envVars = opts.envVars || process.env;
  const bucket =
    envVars.S3_RESULTS_BUCKET != null
      ? String(envVars.S3_RESULTS_BUCKET).trim()
      : '';
  if (!bucket) {
    throw new Error('S3_RESULTS_BUCKET is required');
  }

  const key = resultsKey({
    env: opts.env,
    source: opts.source,
    userId: opts.userId,
    catalogId: opts.catalogId,
    searchId: opts.searchId,
  });

  const body = {
    searchId: String(opts.searchId).trim(),
    source: String(opts.source).trim(),
    userId: String(opts.userId).trim(),
    products: Array.isArray(opts.products) ? opts.products : [],
  };

  const putObject =
    typeof opts.putObject === 'function'
      ? opts.putObject
      : defaultPutObject({ createS3Client: opts.createS3Client });

  const payload = JSON.stringify(body);
  await putObject({
    Bucket: bucket,
    Key: key,
    Body: payload,
    ContentType: 'application/json',
  });

  return { bucket, key, body };
}

module.exports = { writeResults, ResultsPathError, defaultPutObject };
