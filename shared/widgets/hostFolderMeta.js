'use strict';

/**
 * FR-3373: S3 host folder marker metadata, tags, and annotation sidecars.
 * Physical paths stay FR-197 `{env}/x/{customerNumber}/`.
 */

const { normalizeHost } = require('../components/customers');
const {
  assertWidgetGuid,
  hostDir,
  widgetDir,
} = require('./widgetPath');

/**
 * @param {unknown} customerNumber
 * @returns {string}
 */
function assertCustomerNumberLocal(customerNumber) {
  // hostDir validates; return canonical string
  const key = hostDir('sandbox', customerNumber);
  return key.slice('sandbox/x/'.length);
}

const ANNOTATION_MAX_BYTES = 1024 * 1024;
const TAG_HASDNS = 'hasdns';
const TAG_PARTNERID = 'partnerid';
const TAG_HASUPG = 'hasupg';

/**
 * File-system / S3-key safe representation of a host URL hostname.
 * @param {unknown} host
 * @returns {string}
 */
function safeHostFolderName(host) {
  const h = normalizeHost(host);
  // strip scheme leftovers if a full URL slipped in
  const noScheme = h.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const hostOnly = noScheme.split('/')[0].split('?')[0].split('#')[0];
  const safe = hostOnly.replace(/[^a-z0-9.-]+/g, '_').replace(/^_+|_+$/g, '');
  if (!safe || safe === '.' || safe === '..' || safe.includes('..')) {
    const err = new Error('invalid_host_folder_name');
    err.code = 'invalid_host_folder_name';
    throw err;
  }
  return safe;
}

/**
 * Zero-byte folder marker key (trailing slash).
 * @param {string} env
 * @param {string|number} customerNumber
 * @returns {string}
 */
function hostFolderMarkerKey(env, customerNumber) {
  return `${hostDir(env, customerNumber)}/`;
}

/**
 * @param {string} env
 * @param {string|number} customerNumber
 * @returns {string}
 */
function hostAnnotationsKey(env, customerNumber) {
  return `${hostDir(env, customerNumber)}/_host.annotations.json`;
}

/**
 * @param {string} env
 * @param {string|number} customerNumber
 * @param {string} widgetGuid
 * @returns {string}
 */
function widgetAnnotationsKey(env, customerNumber, widgetGuid) {
  return `${widgetDir(env, customerNumber, widgetGuid)}/_annotations.json`;
}

/**
 * @param {{
 *   userId: string,
 *   host: string,
 *   customerNumber: string|number,
 * }} opts
 * @returns {Record<string, string>}
 */
function buildHostMetadata(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('buildHostMetadata opts required');
  }
  const userId = opts.userId == null ? '' : String(opts.userId).trim();
  if (!userId) {
    const err = new Error('userid_required');
    err.code = 'userid_required';
    throw err;
  }
  const host = normalizeHost(opts.host);
  const customerNumber = assertCustomerNumberLocal(opts.customerNumber);
  return {
    userid: userId,
    host,
    hostkey: safeHostFolderName(host),
    customerNumber,
  };
}

/**
 * @param {{
 *   hasdns?: boolean|string|number,
 *   partnerid?: string|null,
 *   hasupg?: boolean|string|number,
 * }} [opts]
 * @returns {{ Key: string, Value: string }[]}
 */
function buildHostTagSet(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const hasdns = o.hasdns === true || o.hasdns === 1 || o.hasdns === '1' ? '1' : '0';
  const hasupg = o.hasupg === true || o.hasupg === 1 || o.hasupg === '1' ? '1' : '0';
  const partnerid =
    o.partnerid == null || o.partnerid === ''
      ? ''
      : String(o.partnerid).trim();
  return [
    { Key: TAG_HASDNS, Value: hasdns },
    { Key: TAG_PARTNERID, Value: partnerid },
    { Key: TAG_HASUPG, Value: hasupg },
  ];
}

/**
 * @param {{ Key: string, Value: string }[]|undefined|null} tagSet
 * @returns {{ hasdns: boolean, partnerid: string, hasupg: boolean }}
 */
function parseHostTagSet(tagSet) {
  const map = new Map();
  for (const t of Array.isArray(tagSet) ? tagSet : []) {
    if (!t || t.Key == null) continue;
    map.set(String(t.Key), t.Value == null ? '' : String(t.Value));
  }
  return {
    hasdns: map.get(TAG_HASDNS) === '1',
    partnerid: map.get(TAG_PARTNERID) || '',
    hasupg: map.get(TAG_HASUPG) === '1',
  };
}

/**
 * Create zero-byte host folder marker with Metadata + tags (idempotent).
 * @param {{
 *   env: string,
 *   customerNumber: string|number,
 *   host: string,
 *   userId: string,
 *   putObject: Function,
 *   headObject?: Function,
 *   putObjectTagging?: Function,
 *   hasdns?: boolean|string|number,
 *   partnerid?: string|null,
 *   hasupg?: boolean|string|number,
 * }} opts
 * @returns {Promise<{ created: boolean, key: string, metadata: Record<string,string>, tags: object }>}
 */
async function ensureHostFolderMarker(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('ensureHostFolderMarker opts required');
  }
  if (typeof opts.putObject !== 'function') {
    throw new Error('putObject_required');
  }
  const env = opts.env;
  const customerNumber = assertCustomerNumberLocal(opts.customerNumber);
  const key = hostFolderMarkerKey(env, customerNumber);
  const metadata = buildHostMetadata({
    userId: opts.userId,
    host: opts.host,
    customerNumber,
  });
  const tagSet = buildHostTagSet(opts);
  const tags = parseHostTagSet(tagSet);

  if (typeof opts.headObject === 'function') {
    try {
      await opts.headObject({ Key: key });
      return { created: false, key, metadata, tags };
    } catch (err) {
      const status = err && (err.$metadata && err.$metadata.httpStatusCode);
      const code = err && (err.name || err.code);
      if (status !== 404 && code !== 'NotFound' && code !== 'NoSuchKey') {
        throw err;
      }
    }
  }

  const tagging =
    typeof opts.putObjectTagging === 'function'
      ? undefined
      : tagSet.map((t) => `${t.Key}=${encodeURIComponent(t.Value)}`).join('&');

  await opts.putObject({
    Key: key,
    Body: Buffer.alloc(0),
    ContentLength: 0,
    Metadata: metadata,
    ...(tagging ? { Tagging: tagging } : {}),
  });

  if (typeof opts.putObjectTagging === 'function') {
    await opts.putObjectTagging({
      Key: key,
      Tagging: { TagSet: tagSet },
    });
  }

  return { created: true, key, metadata, tags };
}

/**
 * Update mutable tags on the host folder marker.
 * @param {{
 *   env: string,
 *   customerNumber: string|number,
 *   putObjectTagging: Function,
 *   hasdns?: boolean|string|number,
 *   partnerid?: string|null,
 *   hasupg?: boolean|string|number,
 * }} opts
 */
async function putHostFolderTags(opts) {
  if (!opts || typeof opts.putObjectTagging !== 'function') {
    throw new Error('putObjectTagging_required');
  }
  const key = hostFolderMarkerKey(opts.env, opts.customerNumber);
  const tagSet = buildHostTagSet(opts);
  await opts.putObjectTagging({
    Key: key,
    Tagging: { TagSet: tagSet },
  });
  return { key, tags: parseHostTagSet(tagSet) };
}

/**
 * True when DNS TXT resolve should be skipped (hasdns already 1).
 * @param {{ getObjectTagging: Function, env: string, customerNumber: string|number }} opts
 */
async function shouldSkipDnsCheck(opts) {
  if (!opts || typeof opts.getObjectTagging !== 'function') {
    return false;
  }
  try {
    const key = hostFolderMarkerKey(opts.env, opts.customerNumber);
    const out = await opts.getObjectTagging({ Key: key });
    const parsed = parseHostTagSet(out && out.TagSet);
    return parsed.hasdns === true;
  } catch {
    return false;
  }
}

/**
 * @param {unknown} payload
 * @returns {Buffer}
 */
function encodeAnnotationBody(payload) {
  const text =
    typeof payload === 'string' ? payload : `${JSON.stringify(payload, null, 2)}\n`;
  const buf = Buffer.from(text, 'utf8');
  if (buf.length > ANNOTATION_MAX_BYTES) {
    const err = new Error('annotation_too_large');
    err.code = 'annotation_too_large';
    err.maxBytes = ANNOTATION_MAX_BYTES;
    err.bytes = buf.length;
    throw err;
  }
  return buf;
}

/**
 * @param {{
 *   env: string,
 *   customerNumber: string|number,
 *   putObject: Function,
 *   payload: unknown,
 * }} opts
 */
async function putHostAnnotations(opts) {
  if (!opts || typeof opts.putObject !== 'function') {
    throw new Error('putObject_required');
  }
  const key = hostAnnotationsKey(opts.env, opts.customerNumber);
  const Body = encodeAnnotationBody(opts.payload);
  await opts.putObject({
    Key: key,
    Body,
    ContentType: 'application/json; charset=utf-8',
    ContentLength: Body.length,
  });
  return { key, bytes: Body.length };
}

/**
 * @param {{
 *   env: string,
 *   customerNumber: string|number,
 *   widgetGuid: string,
 *   putObject: Function,
 *   payload: unknown,
 * }} opts
 */
async function putWidgetAnnotations(opts) {
  if (!opts || typeof opts.putObject !== 'function') {
    throw new Error('putObject_required');
  }
  assertWidgetGuid(opts.widgetGuid);
  const key = widgetAnnotationsKey(
    opts.env,
    opts.customerNumber,
    opts.widgetGuid,
  );
  const Body = encodeAnnotationBody(opts.payload);
  await opts.putObject({
    Key: key,
    Body,
    ContentType: 'application/json; charset=utf-8',
    ContentLength: Body.length,
  });
  return { key, bytes: Body.length };
}

module.exports = {
  ANNOTATION_MAX_BYTES,
  TAG_HASDNS,
  TAG_PARTNERID,
  TAG_HASUPG,
  safeHostFolderName,
  hostFolderMarkerKey,
  hostAnnotationsKey,
  widgetAnnotationsKey,
  buildHostMetadata,
  buildHostTagSet,
  parseHostTagSet,
  ensureHostFolderMarker,
  putHostFolderTags,
  shouldSkipDnsCheck,
  putHostAnnotations,
  putWidgetAnnotations,
};
