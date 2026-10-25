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
    email: opts.email == null ? '' : String(opts.email).trim(),
    passwordhash: opts.passwordhash == null ? '' : String(opts.passwordhash),
    stripeaccountid:
      opts.stripeaccountid == null ? '' : String(opts.stripeaccountid).trim(),
    stripecustomerid:
      opts.stripecustomerid == null ? '' : String(opts.stripecustomerid).trim(),
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

/**
 * @param {unknown} [now]
 * @returns {string} ISO 8601 UTC with milliseconds
 */
function isoLastmod(now) {
  const d = now instanceof Date ? now : now ? new Date(now) : new Date();
  return d.toISOString();
}

/**
 * Read marker metadata (+ optional tags) for rewrite helpers.
 * @param {{
 *   Key: string,
 *   headObject?: Function,
 *   getObject?: Function,
 *   getObjectTagging?: Function,
 * }} opts
 */
async function readMarkerState(opts) {
  const Key = String(opts.Key || '');
  if (!Key) {
    const err = new Error('marker_key_required');
    err.code = 'marker_key_required';
    throw err;
  }
  /** @type {Record<string, string>} */
  let metadata = {};
  /** @type {Buffer|null} */
  let body = null;
  let contentType;
  if (typeof opts.headObject === 'function') {
    const head = await opts.headObject({ Key });
    metadata = { ...(head.Metadata || head.metadata || {}) };
  }
  if (typeof opts.getObject === 'function') {
    const obj = await opts.getObject({ Key });
    metadata = {
      ...metadata,
      ...(obj.Metadata || obj.metadata || {}),
    };
    let raw = obj.Body != null ? obj.Body : obj.body;
    if (raw && typeof raw.transformToByteArray === 'function') {
      raw = Buffer.from(await raw.transformToByteArray());
    } else if (raw && typeof raw.transformToString === 'function') {
      raw = Buffer.from(await raw.transformToString(), 'utf8');
    } else if (raw != null && !Buffer.isBuffer(raw)) {
      raw = Buffer.from(String(raw), 'utf8');
    }
    body = Buffer.isBuffer(raw) ? raw : Buffer.alloc(0);
    contentType = obj.ContentType || obj.contentType;
  }
  /** @type {{ Key: string, Value: string }[]|undefined} */
  let tagSet;
  if (typeof opts.getObjectTagging === 'function') {
    try {
      const tagged = await opts.getObjectTagging({ Key });
      if (tagged && Array.isArray(tagged.TagSet)) {
        tagSet = tagged.TagSet.map((t) => ({
          Key: String(t.Key),
          Value: t.Value == null ? '' : String(t.Value),
        }));
      }
    } catch {
      // tags optional
    }
  }
  return { Key, metadata, body, contentType, tagSet };
}

/**
 * Rewrite marker metadata (self-copy REPLACE or get+put); preserve tags.
 * @param {{
 *   Key: string,
 *   metadata: Record<string, string>,
 *   body?: Buffer|null,
 *   contentType?: string,
 *   tagSet?: { Key: string, Value: string }[],
 *   bucket?: string,
 *   copyObject?: Function,
 *   putObject?: Function,
 *   putObjectTagging?: Function,
 * }} opts
 */
async function rewriteMarkerMetadata(opts) {
  const Key = String(opts.Key || '');
  const metadata = { ...(opts.metadata || {}) };
  const tagSet = opts.tagSet;
  let etag;
  if (typeof opts.copyObject === 'function') {
    const bucket = opts.bucket || 'a-clubs';
    const encodedKey = Key.split('/')
      .map((p) => encodeURIComponent(p))
      .join('/');
    const copyResp = await opts.copyObject({
      Key,
      CopySource: `${bucket}/${encodedKey}`,
      MetadataDirective: 'REPLACE',
      Metadata: metadata,
      ...(tagSet ? { TaggingDirective: 'COPY' } : {}),
      ...(opts.contentType ? { ContentType: opts.contentType } : {}),
    });
    etag =
      copyResp &&
      ((copyResp.CopyObjectResult && copyResp.CopyObjectResult.ETag) ||
        copyResp.ETag);
  } else if (typeof opts.putObject === 'function') {
    const Body =
      opts.body == null
        ? Buffer.alloc(0)
        : Buffer.isBuffer(opts.body)
          ? opts.body
          : Buffer.from(String(opts.body), 'utf8');
    const putResp = await opts.putObject({
      Key,
      Body,
      ContentLength: Body.length,
      Metadata: metadata,
      ...(opts.contentType ? { ContentType: opts.contentType } : {}),
    });
    etag = putResp && putResp.ETag;
    if (tagSet && typeof opts.putObjectTagging === 'function') {
      await opts.putObjectTagging({
        Key,
        Tagging: { TagSet: tagSet },
      });
    }
  } else {
    throw new Error('copyObject_or_putObject_required');
  }
  const out = { Key, metadata };
  if (etag) out.etag = String(etag).replace(/"/g, '');
  return out;
}

/**
 * Bump lastmod ISO UTC ms on a marker; preserve other metadata keys and tags.
 * FR #3968: used by parts-gateway and walrus drain (#3964 follow-up).
 * @param {{
 *   Key: string,
 *   bucket?: string,
 *   now?: Date|string|number,
 *   headObject?: Function,
 *   getObject?: Function,
 *   getObjectTagging?: Function,
 *   copyObject?: Function,
 *   putObject?: Function,
 *   putObjectTagging?: Function,
 * }} opts
 */
async function touchLastmod(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('touchLastmod opts required');
  }
  if (typeof opts.copyObject !== 'function' && typeof opts.getObject !== 'function') {
    throw new Error('copyObject_or_getObject_required');
  }
  const state = await readMarkerState(opts);
  const lastmod = isoLastmod(opts.now);
  const metadata = { ...state.metadata, lastmod };
  await rewriteMarkerMetadata({
    Key: state.Key,
    metadata,
    body: state.body == null ? Buffer.alloc(0) : state.body,
    contentType: state.contentType,
    tagSet: state.tagSet,
    bucket: opts.bucket,
    copyObject: opts.copyObject,
    putObject: opts.putObject,
    putObjectTagging: opts.putObjectTagging,
  });
  return { Key: state.Key, lastmod, metadata };
}

/**
 * FR #4891: set enabled=1 on a GUID marker (never back to 0); bumps lastmod;
 * preserves other keys/tags. Replaces former init flag (Simon 17:21).
 * @param {{
 *   Key: string,
 *   bucket?: string,
 *   now?: Date|string|number,
 *   headObject?: Function,
 *   getObject?: Function,
 *   getObjectTagging?: Function,
 *   copyObject?: Function,
 *   putObject?: Function,
 *   putObjectTagging?: Function,
 * }} opts
 */
async function setEnabled(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('setEnabled opts required');
  }
  if (typeof opts.copyObject !== 'function' && typeof opts.getObject !== 'function') {
    throw new Error('copyObject_or_getObject_required');
  }
  const state = await readMarkerState(opts);
  const lastmod = isoLastmod(opts.now);
  const metadata = { ...state.metadata, enabled: '1', lastmod };
  await rewriteMarkerMetadata({
    Key: state.Key,
    metadata,
    body: state.body == null ? Buffer.alloc(0) : state.body,
    contentType: state.contentType,
    tagSet: state.tagSet,
    bucket: opts.bucket,
    copyObject: opts.copyObject,
    putObject: opts.putObject,
    putObjectTagging: opts.putObjectTagging,
  });
  return { Key: state.Key, enabled: 1, lastmod, metadata };
}

/**
 * One-release compat alias: writes enabled:'1' (not init). Prefer setEnabled.
 * @param {Parameters<typeof setEnabled>[0]} opts
 */
async function setInit(opts) {
  return setEnabled(opts);
}

/**
 * FR #4917: set hasresults=1 on a GUID marker; bumps lastmod;
 * preserves other keys/tags (enabled, annotated, uri, …).
 * FR #4918 monitor clears back to 0 via clearHasResults after a successful agent run.
 * @param {{
 *   Key: string,
 *   bucket?: string,
 *   now?: Date|string|number,
 *   headObject?: Function,
 *   getObject?: Function,
 *   getObjectTagging?: Function,
 *   copyObject?: Function,
 *   putObject?: Function,
 *   putObjectTagging?: Function,
 * }} opts
 */
async function setHasResults(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('setHasResults opts required');
  }
  if (typeof opts.copyObject !== 'function' && typeof opts.getObject !== 'function') {
    throw new Error('copyObject_or_getObject_required');
  }
  const state = await readMarkerState(opts);
  const lastmod = isoLastmod(opts.now);
  const metadata = { ...state.metadata, hasresults: '1', lastmod };
  await rewriteMarkerMetadata({
    Key: state.Key,
    metadata,
    body: state.body == null ? Buffer.alloc(0) : state.body,
    contentType: state.contentType,
    tagSet: state.tagSet,
    bucket: opts.bucket,
    copyObject: opts.copyObject,
    putObject: opts.putObject,
    putObjectTagging: opts.putObjectTagging,
  });
  return { Key: state.Key, hasresults: 1, lastmod, metadata };
}

/**
 * FR #4918: deterministic monitor sets hasresults=0 after a successful agent run.
 * Preserves other metadata keys/tags; bumps lastmod.
 * @param {Parameters<typeof setHasResults>[0]} opts
 */
async function clearHasResults(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('clearHasResults opts required');
  }
  if (typeof opts.copyObject !== 'function' && typeof opts.getObject !== 'function') {
    throw new Error('copyObject_or_getObject_required');
  }
  const state = await readMarkerState(opts);
  const lastmod = isoLastmod(opts.now);
  const metadata = { ...state.metadata, hasresults: '0', lastmod };
  const rewritten = await rewriteMarkerMetadata({
    Key: state.Key,
    metadata,
    body: state.body == null ? Buffer.alloc(0) : state.body,
    contentType: state.contentType,
    tagSet: state.tagSet,
    bucket: opts.bucket,
    copyObject: opts.copyObject,
    putObject: opts.putObject,
    putObjectTagging: opts.putObjectTagging,
  });
  const out = { Key: state.Key, hasresults: 0, lastmod, metadata };
  if (rewritten && rewritten.etag) out.etag = rewritten.etag;
  return out;
}

/**
 * Hash a host password for S3 metadata storage (FR #3968).
 * Format: scrypt$16384$8$1$<saltHex>$<hashHex> (Node crypto.scrypt).
 * Madeira's auth layer is not vendored here; claim/onboarding may pass a
 * precomputed hash string instead. Never log plaintext or the hash.
 * @param {string} plaintext
 * @param {{ salt?: Buffer }} [opts]
 * @returns {string}
 */
function hashHostPassword(plaintext, opts = {}) {
  const crypto = require('node:crypto');
  const plain = plaintext == null ? '' : String(plaintext);
  if (!plain) {
    const err = new Error('password_required');
    err.code = 'password_required';
    throw err;
  }
  const N = 16384;
  const r = 8;
  const p = 1;
  const salt = opts.salt || crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, 32, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * True when value looks like our scrypt hash (not plaintext).
 * @param {unknown} value
 * @returns {boolean}
 */
function isHostPasswordHash(value) {
  const s = value == null ? '' : String(value);
  return /^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/i.test(s);
}

/**
 * Set host email + passwordhash on the host marker; bumps lastmod.
 * Pass a precomputed hash (isHostPasswordHash) or plaintext (hashed here).
 * Never stores plaintext. Never logs email/hash.
 * @param {{
 *   Key: string,
 *   email?: string|null,
 *   passwordHash?: string|null,
 *   password?: string|null,
 *   bucket?: string,
 *   now?: Date|string|number,
 *   headObject?: Function,
 *   getObject?: Function,
 *   getObjectTagging?: Function,
 *   copyObject?: Function,
 *   putObject?: Function,
 *   putObjectTagging?: Function,
 * }} opts
 */
async function setHostCredentials(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('setHostCredentials opts required');
  }
  if (typeof opts.copyObject !== 'function' && typeof opts.getObject !== 'function') {
    throw new Error('copyObject_or_getObject_required');
  }
  let passwordhash = opts.passwordHash == null ? '' : String(opts.passwordHash);
  if (opts.password != null && String(opts.password) !== '') {
    passwordhash = hashHostPassword(String(opts.password));
  }
  if (passwordhash && !isHostPasswordHash(passwordhash)) {
    // Treat non-hash strings as plaintext and hash them (never store raw).
    passwordhash = hashHostPassword(passwordhash);
  }
  const email = opts.email == null ? '' : String(opts.email).trim();
  const state = await readMarkerState(opts);
  const lastmod = isoLastmod(opts.now);
  const metadata = {
    ...state.metadata,
    email,
    passwordhash,
    lastmod,
  };
  await rewriteMarkerMetadata({
    Key: state.Key,
    metadata,
    body: state.body == null ? Buffer.alloc(0) : state.body,
    contentType: state.contentType,
    tagSet: state.tagSet,
    bucket: opts.bucket,
    copyObject: opts.copyObject,
    putObject: opts.putObject,
    putObjectTagging: opts.putObjectTagging,
  });
  return { Key: state.Key, email, passwordhashSet: Boolean(passwordhash), lastmod, metadata };
}

/**
 * Set Stripe Connect / Customer ids on the host marker; bumps lastmod.
 * No Stripe API secret keys --- only acct_/cus_ style ids (FR #3968).
 * @param {{
 *   Key: string,
 *   accountId?: string|null,
 *   customerId?: string|null,
 *   bucket?: string,
 *   now?: Date|string|number,
 *   headObject?: Function,
 *   getObject?: Function,
 *   getObjectTagging?: Function,
 *   copyObject?: Function,
 *   putObject?: Function,
 *   putObjectTagging?: Function,
 * }} opts
 */
async function setHostStripe(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('setHostStripe opts required');
  }
  if (typeof opts.copyObject !== 'function' && typeof opts.getObject !== 'function') {
    throw new Error('copyObject_or_getObject_required');
  }
  const stripeaccountid =
    opts.accountId == null ? '' : String(opts.accountId).trim();
  const stripecustomerid =
    opts.customerId == null ? '' : String(opts.customerId).trim();
  const state = await readMarkerState(opts);
  const lastmod = isoLastmod(opts.now);
  const metadata = {
    ...state.metadata,
    stripeaccountid,
    stripecustomerid,
    lastmod,
  };
  await rewriteMarkerMetadata({
    Key: state.Key,
    metadata,
    body: state.body == null ? Buffer.alloc(0) : state.body,
    contentType: state.contentType,
    tagSet: state.tagSet,
    bucket: opts.bucket,
    copyObject: opts.copyObject,
    putObject: opts.putObject,
    putObjectTagging: opts.putObjectTagging,
  });
  return {
    Key: state.Key,
    stripeaccountid,
    stripecustomerid,
    lastmod,
    metadata,
  };
}


/**
 * Identity from a-clubs host marker Metadata (FR #4287 / #4415).
 * `userid` wins; legacy `customernumber` is a fallback until migration.
 * @param {Record<string, string>|null|undefined} md
 * @returns {string} uppercase userid or empty
 */
function useridFromHostMetadata(md) {
  const m = md || {};
  const direct = String(m.userid || m.userId || '').trim();
  if (direct) return direct.toUpperCase();
  for (const [k, v] of Object.entries(m)) {
    if (String(k).toLowerCase() !== 'customernumber') continue;
    const legacy = String(v == null ? '' : v).trim();
    if (legacy) return legacy.toUpperCase();
  }
  return '';
}

/** Metadata keys that must never appear in GET /parts JSON. */
const PARTS_RESPONSE_SECRET_KEYS = Object.freeze([
  'email',
  'passwordhash',
  'stripeaccountid',
  'stripecustomerid',
  'stripesk',
  'stripepk',
  'stripewhsec',
]);

/**
 * @param {Record<string, unknown>|null|undefined} obj
 * @returns {boolean} true if any secret key is present
 */
function partsResponseLeaksSecrets(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const keys = Object.keys(obj).map((k) => k.toLowerCase());
  return PARTS_RESPONSE_SECRET_KEYS.some((s) => keys.includes(s));
}

module.exports = {
  ANNOTATION_MAX_BYTES,
  TAG_HASDNS,
  TAG_PARTNERID,
  TAG_HASUPG,
  PARTS_RESPONSE_SECRET_KEYS,
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
  isoLastmod,
  touchLastmod,
  setEnabled,
  setInit,
  setHasResults,
  clearHasResults,
  hashHostPassword,
  isHostPasswordHash,
  setHostCredentials,
  setHostStripe,
  partsResponseLeaksSecrets,
  useridFromHostMetadata,
};
