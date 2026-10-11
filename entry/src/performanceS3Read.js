'use strict';

/**
 * FR-160: default /account/performance read path from S3 when
 * S3_RESULTS_BUCKET is set.
 *
 * LOCKED stats object key:
 *   {env}/_stats/{userId}/events.json
 *
 * Body (any array may be omitted / empty):
 *   {
 *     "clickVisitEvents": [ { userId, env, type: "click"|"visit", at, visitorId? } ],
 *     "saleEvents": [ { userId, env, at, amount, commission, currency } ],
 *     "topEvents": [ { userId, env, at?, linkId?, merchantId?, merchantName?, clicks?, sales? } ]
 *   }
 *
 * Mapping store (`{env}/_mapping/{userId}/`) is opened via createS3MappingStore
 * so listMappingsByUserId is available for joins; missing stats key => empty
 * arrays (200 zeros), not a hard failure.
 */

const {
  createS3MappingStore,
  MappingError,
} = require('../../shared/mapping/s3Store');
const { listMappingsByUserId } = require('../../shared/mapping/mapping');

/**
 * @param {{ env: string, userId: string }} parts
 * @returns {string}
 */
function performanceStatsObjectKey(parts = {}) {
  const env = parts.env != null ? String(parts.env).trim() : '';
  if (env !== 'live' && env !== 'sandbox') {
    throw new Error('performance stats env must be live|sandbox');
  }
  const userId = parts.userId != null ? String(parts.userId).trim() : '';
  if (!userId || /[\\/]/.test(userId)) {
    throw new Error('performance stats userId required');
  }
  return `${env}/_stats/${userId}/events.json`;
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
 * @param {object} opts
 * @returns {Promise<{
 *   clickVisitEvents: object[],
 *   saleEvents: object[],
 *   topEvents: object[],
 *   mappings: object[],
 * }>}
 */
async function loadPerformanceStatsDoc(opts = {}) {
  const bucket = opts.bucket != null ? String(opts.bucket).trim() : '';
  const env = opts.env;
  const userId = opts.userId != null ? String(opts.userId).trim() : '';
  const empty = {
    clickVisitEvents: [],
    saleEvents: [],
    topEvents: [],
    mappings: [],
  };
  if (!bucket || !userId) return empty;

  const getObject =
    typeof opts.getObject === 'function' ? opts.getObject : defaultGetObject(opts);
  const Key = performanceStatsObjectKey({ env, userId });

  let doc = {};
  try {
    const res = await getObject({ Bucket: bucket, Key });
    const body =
      res && res.Body && typeof res.Body.transformToString === 'function'
        ? await res.Body.transformToString()
        : String(res.Body || '');
    if (body) {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object') doc = parsed;
    }
  } catch (err) {
    if (!isNoSuchKey(err)) throw err;
  }

  /** @type {object[]} */
  let mappings = [];
  if (opts.mappingStore && typeof listMappingsByUserId === 'function') {
    try {
      mappings = await listMappingsByUserId(
        { env, userId },
        { store: opts.mappingStore },
      );
    } catch (err) {
      if (!(err instanceof MappingError)) throw err;
      mappings = [];
    }
  }

  return {
    clickVisitEvents: Array.isArray(doc.clickVisitEvents)
      ? doc.clickVisitEvents
      : Array.isArray(doc.events)
        ? doc.events.filter(
            (e) =>
              e &&
              (String(e.type || '').toLowerCase() === 'click' ||
                String(e.type || '').toLowerCase() === 'visit'),
          )
        : [],
    saleEvents: Array.isArray(doc.saleEvents)
      ? doc.saleEvents
      : Array.isArray(doc.events)
        ? doc.events.filter(
            (e) =>
              e &&
              e.amount != null &&
              String(e.type || '').toLowerCase() !== 'click' &&
              String(e.type || '').toLowerCase() !== 'visit',
          )
        : [],
    topEvents: Array.isArray(doc.topEvents)
      ? doc.topEvents
      : Array.isArray(doc.events)
        ? doc.events.filter(
            (e) => e && (e.linkId != null || e.merchantId != null),
          )
        : [],
    mappings: Array.isArray(mappings) ? mappings : [],
  };
}

/**
 * When S3_RESULTS_BUCKET is set, return default list* deps backed by the
 * mapping store + documented stats key. Returns null when bucket absent.
 *
 * @param {object} [opts]
 * @param {Record<string, string|undefined>} [opts.envVars]
 * @param {string} [opts.bucket]
 * @param {Function} [opts.getObject]
 * @param {Function} [opts.putObject]
 * @param {Function} [opts.listObjectsV2]
 * @param {Function} [opts.createS3Client]
 * @param {{ get: Function, put: Function, listByUserId?: Function }} [opts.mappingStore]
 * @returns {{
 *   listClickVisitEvents: Function,
 *   listSaleEvents: Function,
 *   listTopEvents: Function,
 *   mappingStore: object,
 *   bucket: string,
 * }|null}
 */
function createPerformanceS3Deps(opts = {}) {
  const envVars = opts.envVars || process.env;
  const bucketRaw =
    opts.bucket != null
      ? String(opts.bucket).trim()
      : envVars.S3_RESULTS_BUCKET != null
        ? String(envVars.S3_RESULTS_BUCKET).trim()
        : '';
  if (!bucketRaw) return null;

  const mappingStore =
    opts.mappingStore && typeof opts.mappingStore.get === 'function'
      ? opts.mappingStore
      : createS3MappingStore({
          bucket: bucketRaw,
          envVars,
          putObject: opts.putObject,
          getObject: opts.getObject,
          listObjectsV2: opts.listObjectsV2,
          createS3Client: opts.createS3Client,
        });

  /**
   * @param {{ userId: string, env: string, from?: string, to?: string }} q
   */
  async function load(q) {
    return loadPerformanceStatsDoc({
      bucket: bucketRaw,
      env: q.env,
      userId: q.userId,
      getObject: opts.getObject,
      createS3Client: opts.createS3Client,
      mappingStore,
    });
  }

  return {
    bucket: bucketRaw,
    mappingStore,
    listClickVisitEvents: async (q) => (await load(q)).clickVisitEvents,
    listSaleEvents: async (q) => (await load(q)).saleEvents,
    listTopEvents: async (q) => (await load(q)).topEvents,
  };
}

/**
 * Resolve list* functions for handlePerformance: explicit deps win; else S3.
 * @param {object} deps
 * @param {Record<string, string|undefined>} env
 */
function resolvePerformanceListDeps(deps = {}, env = process.env) {
  const hasExplicit =
    typeof deps.listClickVisitEvents === 'function' ||
    typeof deps.listSaleEvents === 'function' ||
    typeof deps.listTopEvents === 'function' ||
    Array.isArray(deps.clickVisitEvents) ||
    Array.isArray(deps.saleEvents) ||
    Array.isArray(deps.topEvents);

  if (hasExplicit) {
    return {
      listClickVisitEvents: deps.listClickVisitEvents,
      listSaleEvents: deps.listSaleEvents,
      listTopEvents: deps.listTopEvents,
      clickVisitEvents: deps.clickVisitEvents,
      saleEvents: deps.saleEvents,
      topEvents: deps.topEvents,
    };
  }

  const wired = createPerformanceS3Deps({
    envVars: env,
    getObject: deps.getObject,
    putObject: deps.putObject,
    listObjectsV2: deps.listObjectsV2,
    createS3Client: deps.createS3Client,
    mappingStore: deps.mappingStore,
    bucket: deps.bucket,
  });
  if (!wired) {
    return {
      listClickVisitEvents: deps.listClickVisitEvents,
      listSaleEvents: deps.listSaleEvents,
      listTopEvents: deps.listTopEvents,
      clickVisitEvents: deps.clickVisitEvents,
      saleEvents: deps.saleEvents,
      topEvents: deps.topEvents,
    };
  }
  return {
    listClickVisitEvents: wired.listClickVisitEvents,
    listSaleEvents: wired.listSaleEvents,
    listTopEvents: wired.listTopEvents,
    clickVisitEvents: undefined,
    saleEvents: undefined,
    topEvents: undefined,
  };
}

module.exports = {
  performanceStatsObjectKey,
  loadPerformanceStatsDoc,
  createPerformanceS3Deps,
  resolvePerformanceListDeps,
};
