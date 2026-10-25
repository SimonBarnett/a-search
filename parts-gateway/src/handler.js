'use strict';

/**
 * FR #3968 / FR #4107 / FR #4891: standalone parts-gateway Lambda --- GET /parts
 * via a-clubs S3. No MSSQL, no VPC, no secrets. Host from Origin only.
 * Searching (enabled!=1) → HTTP 202 + Retry-After; ok/no_parts → 200.
 */

const {
  pagePartsAclubs,
  PartsError,
  SEARCHING_RETRY_AFTER_MS,
} = require('./pageParts');

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

function jsonResponse(statusCode, payload, extraHeaders) {
  return {
    statusCode,
    headers: extraHeaders ? { ...JSON_HEADERS, ...extraHeaders } : JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

/**
 * @param {object} [deps]
 */
function buildS3Fns(deps = {}) {
  if (deps.headObject && deps.putObject && deps.getObject) {
    return {
      headObject: deps.headObject,
      putObject: deps.putObject,
      getObject: deps.getObject,
      listObjectsV2: deps.listObjectsV2,
      putObjectTagging: deps.putObjectTagging,
      getObjectTagging: deps.getObjectTagging,
      copyObject: deps.copyObject,
      getObjectAnnotation: deps.getObjectAnnotation,
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
    GetObjectTaggingCommand,
    CopyObjectCommand,
  } = loadS3Sdk();
  const client =
    deps.s3Client ||
    new S3Client({
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-west-2',
    });

  /** Optional: promote module / pageParts may use annotations when present. */
  let getObjectAnnotation = deps.getObjectAnnotation;
  if (!getObjectAnnotation) {
    getObjectAnnotation = async (input) => {
      try {
        const { GetObjectAnnotationCommand } = loadS3Sdk();
        return client.send(
          new GetObjectAnnotationCommand({ Bucket: bucket, ...input }),
        );
      } catch (err) {
        if (err && /Cannot find module|GetObjectAnnotation/.test(String(err))) {
          const e = new Error('NoSuchAnnotation');
          e.name = 'NoSuchAnnotation';
          e.code = 'NoSuchAnnotation';
          e.$metadata = { httpStatusCode: 404 };
          throw e;
        }
        throw err;
      }
    };
  }

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
    getObjectTagging: (input) =>
      client.send(new GetObjectTaggingCommand({ Bucket: bucket, ...input })),
    copyObject: (input) =>
      client.send(new CopyObjectCommand({ Bucket: bucket, ...input })),
    getObjectAnnotation,
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

  let sendMessage = deps.sendMessage;
  const folderEventsQueueUrl =
    deps.folderEventsQueueUrl || process.env.A_CLUBS_FOLDER_EVENTS_QUEUE_URL;
  if (!sendMessage && folderEventsQueueUrl) {
    try {
      // eslint-disable-next-line global-require
      const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
      const sqs =
        deps.sqsClient ||
        new SQSClient({
          region:
            process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-west-2',
        });
      sendMessage = (input) => sqs.send(new SendMessageCommand(input));
    } catch {
      sendMessage = undefined;
    }
  }

  try {
    const page = await pagePartsAclubs({
      // host from Origin only --- query.host ignored (FR #3968 / #4107)
      widgetGuid: query.widgetGuid,
      offset: query.offset,
      n: query.n,
      origin: headers.origin,
      parentOrigin: headers['x-parent-origin'],
      referer: headers.referer,
      pageUri: query.pageUri || query.uri,
      uri: query.uri,
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      listObjectsV2: s3.listObjectsV2,
      putObjectTagging: s3.putObjectTagging,
      getObjectTagging: s3.getObjectTagging,
      copyObject: s3.copyObject,
      getObjectAnnotation: s3.getObjectAnnotation,
      mint: deps.mint,
      sendMessage,
      folderEventsQueueUrl,
      now: deps.now,
    });
    if (page && page.status === 'searching') {
      const retrySec = Math.max(
        1,
        Math.ceil(
          Number(page.retryAfterMs != null ? page.retryAfterMs : SEARCHING_RETRY_AFTER_MS) /
            1000,
        ),
      );
      return jsonResponse(202, page, { 'retry-after': String(retrySec) });
    }
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
      code === 'origin_required' ||
      code === 'club_domain_unresolved' ||
      code === 'invalid_offset_or_n' ||
      code === 'invalid_host_folder_name'
    ) {
      return jsonResponse(400, { error: code });
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
