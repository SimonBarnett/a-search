'use strict';

/**
 * FR #3968: standalone parts-gateway Lambda --- GET /parts via a-clubs S3.
 * No MSSQL, no VPC, no secrets.
 */

const { pagePartsAclubs, PartsError } = require('./pageParts');

/** Lazy-load AWS SDK so unit tests can inject S3 fns without node_modules. */
function loadS3Sdk() {
  // eslint-disable-next-line global-require
  return require('@aws-sdk/client-s3');
}

const JSON_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
};

/**
 * @param {object} event
 * @returns {Record<string, string>}
 */
function queryParams(event) {
  const q =
    (event && event.queryStringParameters) ||
    (event && event.rawQueryString
      ? Object.fromEntries(new URLSearchParams(event.rawQueryString))
      : {}) ||
    {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(q)) {
    if (v != null) out[k] = String(v);
  }
  return out;
}

/**
 * @param {object} event
 * @returns {Record<string, string>}
 */
function headerMap(event) {
  const h = (event && (event.headers || event.Headers)) || {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    if (v != null) out[String(k).toLowerCase()] = String(v);
  }
  return out;
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

/**
 * @param {object} [deps]
 */
function buildS3Fns(deps = {}) {
  if (
    deps.headObject &&
    deps.putObject &&
    deps.getObject
  ) {
    return {
      headObject: deps.headObject,
      putObject: deps.putObject,
      getObject: deps.getObject,
      listObjectsV2: deps.listObjectsV2,
      putObjectTagging: deps.putObjectTagging,
    };
  }

  const bucket =
    deps.bucket ||
    process.env.A_CLUBS_BUCKET ||
    'a-clubs';
  const {
    S3Client,
    HeadObjectCommand,
    PutObjectCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    PutObjectTaggingCommand,
  } = loadS3Sdk();
  const client =
    deps.s3Client ||
    new S3Client({
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-west-2',
    });

  return {
    headObject: (input) =>
      client.send(new HeadObjectCommand({ Bucket: bucket, ...input })),
    putObject: (input) =>
      client.send(new PutObjectCommand({ Bucket: bucket, ...input })),
    getObject: (input) =>
      client.send(new GetObjectCommand({ Bucket: bucket, ...input })),
    listObjectsV2: (input) =>
      client.send(new ListObjectsV2Command({ Bucket: bucket, ...input })),
    putObjectTagging: (input) =>
      client.send(new PutObjectTaggingCommand({ Bucket: bucket, ...input })),
  };
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handlePartsGateway(event, deps = {}) {
  const query = queryParams(event);
  const headers = headerMap(event);
  const s3 = buildS3Fns(deps);

  try {
    const page = await pagePartsAclubs({
      host: query.host,
      widgetGuid: query.widgetGuid,
      offset: query.offset,
      n: query.n,
      origin: headers.origin,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      putObjectTagging: s3.putObjectTagging,
      mint: deps.mint,
    });
    return jsonResponse(200, page);
  } catch (err) {
    const code =
      err instanceof PartsError
        ? err.code
        : err && err.code
          ? String(err.code)
          : 'parts_error';
    if (
      code === 'widget_guid_required' ||
      code === 'invalid_widget_guid' ||
      code === 'host_required' ||
      code === 'invalid_offset_or_n' ||
      code === 'invalid_host_folder_name'
    ) {
      return jsonResponse(400, { error: code });
    }
    if (code === 'widget_host_mismatch') {
      return jsonResponse(403, { error: code, parts: [], nextOffset: null });
    }
    if (code === 'mint_exhausted' || code === 'mint_bad_checksum') {
      return jsonResponse(500, { error: code });
    }
    throw err;
  }
}

function isPartsRoute(method, path) {
  const p = path == null ? '' : String(path).split('?')[0];
  return method === 'GET' && (p === '/parts' || p.endsWith('/parts'));
}

/**
 * API Gateway HTTP API Lambda proxy entry.
 * @param {object} event
 */
async function handler(event) {
  const method =
    (event && event.requestContext && event.requestContext.http && event.requestContext.http.method) ||
    (event && event.httpMethod) ||
    'GET';
  const path =
    (event && event.requestContext && event.requestContext.http && event.requestContext.http.path) ||
    (event && event.rawPath) ||
    (event && event.path) ||
    '/';
  if (!isPartsRoute(method, path)) {
    return jsonResponse(404, { error: 'not_found' });
  }
  return handlePartsGateway(event);
}

module.exports = {
  handler,
  handlePartsGateway,
  isPartsRoute,
  queryParams,
  headerMap,
  buildS3Fns,
};
