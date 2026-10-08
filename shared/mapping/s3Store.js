'use strict';

/**
 * Durable S3 mapping store adapter (FR-054c — LOCKED).
 *
 * LOCKED backing store: S3 inventory JSON under the results bucket:
 *   {env}/_mapping/{userId}/{source}/{tokenHash}.json
 *
 * MSSQL table store is **not** used for FR-054c.
 * writeResults registration is FR-054d (out of scope).
 *
 * Implements the `{ get, put }` interface expected by
 * `upsertMapping` / `getMapping` (natural key from mapping.js).
 */

const { createHash } = require('node:crypto');
const { MappingError, mappingNaturalKey } = require('./mapping');

/**
 * @param {string} token
 * @returns {string} hex prefix safe for S3 object names
 */
function tokenHash(token) {
  return createHash('sha256').update(String(token), 'utf8').digest('hex').slice(0, 40);
}

/**
 * S3 object key for a mapping row.
 * @param {{ env: string, userId: string, source: string, tokenOrClickRef?: string, token?: string }} parts
 * @returns {string}
 */
function mappingObjectKey(parts = {}) {
  const env = parts.env != null ? String(parts.env).trim() : '';
  if (env !== 'live' && env !== 'sandbox') {
    throw new MappingError('mapping env must be live|sandbox', 'mapping_bad_env');
  }
  const userId = parts.userId != null ? String(parts.userId).trim() : '';
  const source = parts.source != null ? String(parts.source).trim() : '';
  const token =
    parts.tokenOrClickRef != null && String(parts.tokenOrClickRef).trim() !== ''
      ? String(parts.tokenOrClickRef).trim()
      : parts.token != null
        ? String(parts.token).trim()
        : '';
  if (!userId || !source || !token) {
    throw new MappingError(
      'mappingObjectKey needs userId, source, token',
      'mapping_bad_key',
    );
  }
  // Path segments must not contain slashes
  if (/[\\/]/.test(userId) || /[\\/]/.test(source)) {
    throw new MappingError(
      'userId/source must not contain path separators',
      'mapping_bad_key',
    );
  }
  return `${env}/_mapping/${userId}/${source}/${tokenHash(token)}.json`;
}

/**
 * @param {string} naturalKey — from mappingNaturalKey (\0-separated)
 * @returns {{ env: string, userId: string, source: string, tokenOrClickRef: string }}
 */
function parseNaturalKey(naturalKey) {
  const parts = String(naturalKey).split('\u0000');
  if (parts.length !== 4) {
    throw new MappingError('bad mapping natural key', 'mapping_bad_key');
  }
  return {
    env: parts[0],
    userId: parts[1],
    source: parts[2],
    tokenOrClickRef: parts[3],
  };
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isNoSuchKey(err) {
  if (!err || typeof err !== 'object') return false;
  const e = /** @type {{ name?: string, Code?: string, code?: string, message?: string }} */ (
    err
  );
  return (
    e.name === 'NoSuchKey' ||
    e.Code === 'NoSuchKey' ||
    e.code === 'NoSuchKey' ||
    (typeof e.message === 'string' && /NoSuchKey/i.test(e.message))
  );
}

/**
 * @param {{ createS3Client?: () => { send: Function } }} [deps]
 */
function defaultPutObject(deps) {
  return async (args) => {
    if (deps && typeof deps.createS3Client === 'function') {
      return deps.createS3Client().send(args);
    }
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const client = new S3Client({});
    return client.send(new PutObjectCommand(args));
  };
}

/**
 * @param {{ createS3Client?: () => { send: Function } }} [deps]
 */
function defaultGetObject(deps) {
  return async (args) => {
    if (deps && typeof deps.createS3Client === 'function') {
      return deps.createS3Client().send(args);
    }
    const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
    const client = new S3Client({});
    return client.send(new GetObjectCommand(args));
  };
}

/**
 * In-memory S3 stand-in shared across adapter instances (FR-054c testable).
 * @returns {{
 *   objects: Map<string, string>,
 *   putObject: Function,
 *   getObject: Function,
 * }}
 */
function createMemoryS3Objects() {
  /** @type {Map<string, string>} */
  const objects = new Map();

  async function putObject({ Bucket, Key, Body }) {
    objects.set(`${Bucket}/${Key}`, String(Body));
    return { ETag: '"mem"' };
  }

  async function getObject({ Bucket, Key }) {
    const body = objects.get(`${Bucket}/${Key}`);
    if (body == null) {
      const err = new Error('NoSuchKey');
      err.name = 'NoSuchKey';
      err.Code = 'NoSuchKey';
      throw err;
    }
    return {
      Body: {
        transformToString: async () => body,
      },
    };
  }

  return { objects, putObject, getObject };
}

/**
 * @param {object} [opts]
 * @param {string} [opts.bucket]
 * @param {Record<string, string|undefined>} [opts.envVars]
 * @param {Function} [opts.putObject]
 * @param {Function} [opts.getObject]
 * @param {Function} [opts.createS3Client]
 * @returns {{ get: Function, put: Function, bucket: string, objectKeyFor: Function }}
 */
function createS3MappingStore(opts = {}) {
  const envVars = opts.envVars || {};
  const bucketRaw =
    opts.bucket != null
      ? String(opts.bucket).trim()
      : envVars.S3_RESULTS_BUCKET != null
        ? String(envVars.S3_RESULTS_BUCKET).trim()
        : '';
  if (!bucketRaw) {
    throw new MappingError(
      'S3_RESULTS_BUCKET (or opts.bucket) required for S3 mapping store',
      'mapping_missing_bucket',
    );
  }
  const bucket = bucketRaw;
  const putObject =
    typeof opts.putObject === 'function' ? opts.putObject : defaultPutObject(opts);
  const getObject =
    typeof opts.getObject === 'function' ? opts.getObject : defaultGetObject(opts);

  function objectKeyForNatural(naturalKey) {
    const parts = parseNaturalKey(naturalKey);
    return mappingObjectKey(parts);
  }

  /**
   * @param {string} naturalKey
   * @returns {Promise<object|null>}
   */
  async function get(naturalKey) {
    const Key = objectKeyForNatural(naturalKey);
    try {
      const res = await getObject({ Bucket: bucket, Key });
      const body =
        res && res.Body && typeof res.Body.transformToString === 'function'
          ? await res.Body.transformToString()
          : String(res.Body || '');
      if (!body) return null;
      const parsed = JSON.parse(body);
      if (!parsed || typeof parsed !== 'object') return null;
      return { ...parsed, meta: { ...(parsed.meta || {}) } };
    } catch (err) {
      if (isNoSuchKey(err)) return null;
      throw err;
    }
  }

  /**
   * @param {string} naturalKey
   * @param {object} record
   * @returns {Promise<object>}
   */
  async function put(naturalKey, record) {
    const Key = objectKeyForNatural(naturalKey);
    const copy = { ...record, meta: { ...(record.meta || {}) } };
    // Ensure natural-key fields stay aligned with path
    const parts = parseNaturalKey(naturalKey);
    copy.env = parts.env;
    copy.userId = parts.userId;
    copy.source = parts.source;
    copy.tokenOrClickRef = parts.tokenOrClickRef;
    copy.token = parts.tokenOrClickRef;
    await putObject({
      Bucket: bucket,
      Key,
      Body: JSON.stringify(copy),
      ContentType: 'application/json; charset=utf-8',
    });
    return { ...copy, meta: { ...copy.meta } };
  }

  return {
    get,
    put,
    bucket,
    objectKeyFor: objectKeyForNatural,
    mappingObjectKey,
  };
}

module.exports = {
  tokenHash,
  mappingObjectKey,
  parseNaturalKey,
  createMemoryS3Objects,
  createS3MappingStore,
  mappingNaturalKey,
  MappingError,
};
