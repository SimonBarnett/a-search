'use strict';

/**
 * Shared worker results writer (FR-009 / FR-033).
 * PutObject to S3_RESULTS_BUCKET at the canonical results key.
 * When `putObject` is omitted, uses @aws-sdk/client-s3 PutObject
 * (override with `createS3Client` for tests).
 *
 * FR-054d: after a successful PutObject, upserts a mapping row for
 * userId / searchId / s3Key (injectable store; durable S3 is FR-054c).
 * Pass `registerMapping: false` to skip (unit tests that only pin PutObject).
 */

const { resultsKey, ResultsPathError } = require('./resultsPath');
const { upsertMapping } = require('./mapping/mapping');
const { createS3MappingStore } = require('./mapping/s3Store');

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
 * @param {object} opts
 * @param {string} bucket
 * @param {Function} putObject
 * @returns {{ get: Function, put: Function }|null}
 */
function resolveMappingStore(opts, bucket, putObject) {
  if (opts.registerMapping === false) {
    return null;
  }
  if (opts.mappingStore && typeof opts.mappingStore.get === 'function') {
    return opts.mappingStore;
  }
  // Auto-wire durable S3 adapter when S3 plumbing is available (production
  // default). Skip for putObject-only unit mocks unless registerMapping:true.
  const hasS3Plumbing =
    typeof opts.getObject === 'function' ||
    typeof opts.createS3Client === 'function' ||
    typeof opts.putObject !== 'function';
  if (!hasS3Plumbing && opts.registerMapping !== true) {
    return null;
  }
  return createS3MappingStore({
    bucket,
    envVars: opts.envVars || process.env,
    putObject,
    getObject: opts.getObject,
    createS3Client: opts.createS3Client,
  });
}

/**
 * @param {{
 *   env: string,
 *   source: string,
 *   userId: string|number,
 *   catalogId: string|number,
 *   searchId: string,
 *   products?: unknown[],
 *   token?: string,
 *   tokenOrClickRef?: string,
 *   envVars?: Record<string, string|undefined>,
 *   putObject?: (args: {
 *     Bucket: string,
 *     Key: string,
 *     Body: string,
 *     ContentType: string,
 *   }) => Promise<unknown>,
 *   getObject?: Function,
 *   createS3Client?: () => { send: Function },
 *   mappingStore?: { get: Function, put: Function },
 *   upsertMapping?: Function,
 *   registerMapping?: boolean,
 * }} opts
 * @returns {Promise<{ bucket: string, key: string, body: object, mapping?: object|null }>}
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

  /** @type {object|null} */
  let mapping = null;
  const store = resolveMappingStore(opts, bucket, putObject);
  if (store) {
    const searchId = String(opts.searchId).trim();
    const token =
      opts.tokenOrClickRef != null && String(opts.tokenOrClickRef).trim() !== ''
        ? String(opts.tokenOrClickRef).trim()
        : opts.token != null && String(opts.token).trim() !== ''
          ? String(opts.token).trim()
          : searchId;
    const upsert =
      typeof opts.upsertMapping === 'function' ? opts.upsertMapping : upsertMapping;
    mapping = await upsert(
      {
        env: opts.env,
        userId: String(opts.userId).trim(),
        source: String(opts.source).trim(),
        tokenOrClickRef: token,
        s3Key: key,
        searchId,
        catalogId: String(opts.catalogId).trim(),
      },
      { store },
    );
  }

  return { bucket, key, body, mapping };
}

module.exports = {
  writeResults,
  ResultsPathError,
  defaultPutObject,
  resolveMappingStore,
};
