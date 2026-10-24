'use strict';

/**
 * FR #4827: a-clubs EventBridge / S3 / compact change events.
 * Maps an object key to { hostkey, guid?, kind, key, etag? }.
 * Keys under IN/ and search-fanout.json are skipped (service output).
 */

const KINDS = new Set(['marker', 'widget', 'searches', 'other']);

/**
 * @param {unknown} key
 * @returns {string}
 */
function decodeKey(key) {
  let s = String(key == null ? '' : key).trim();
  if (!s) return '';
  const plus = s.replace(/\+/g, '%20');
  try {
    s = decodeURIComponent(plus);
  } catch {
    s = String(key).trim();
  }
  return s.replace(/^\/+/, '');
}

/**
 * @param {unknown} etag
 * @returns {string}
 */
function normEtag(etag) {
  return String(etag == null ? '' : etag)
    .replace(/^W\//i, '')
    .replace(/"/g, '')
    .trim()
    .toLowerCase();
}

/**
 * True for keys the annotator must not treat as user edits.
 * @param {unknown} key
 * @returns {boolean}
 */
function isExcludedKey(key) {
  const decoded = decodeKey(key);
  if (!decoded) return true;
  const parts = decoded.split('/');
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i].toLowerCase() === 'in') return true;
  }
  const base = parts[parts.length - 1] || '';
  if (base.toLowerCase() === 'search-fanout.json') return true;
  return false;
}

/**
 * @param {unknown} key
 * @returns {{ hostkey: string, guid?: string }}
 */
function hostGuidFromKey(key) {
  const decoded = decodeKey(key);
  const parts = decoded.split('/').filter((p, idx, arr) => p || idx < arr.length - 1);
  const hostkey = parts[0] ? String(parts[0]) : '';
  let guid;
  if (parts.length >= 2 && parts[1]) {
    const candidate = String(parts[1]);
    if (/^[0-9a-fA-F-]{36}$/.test(candidate)) guid = candidate.toLowerCase();
  }
  return guid ? { hostkey, guid } : { hostkey };
}

const GUID_SEGMENT_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * FR #4833: true only for host marker `{hostkey}/` or GUID marker `{hostkey}/{uuid}/`.
 * Deep folder keys ending in `/` (e.g. `{host}/{guid}/subdir/`) are not markers.
 * @param {unknown} key
 * @returns {boolean}
 */
function isHostOrGuidMarkerKey(key) {
  const decoded = decodeKey(key);
  if (!decoded || !decoded.endsWith('/')) return false;
  if (isExcludedKey(decoded)) return false;
  const parts = decoded.split('/').filter((p) => p.length > 0);
  if (parts.length === 1) return true;
  if (parts.length === 2 && GUID_SEGMENT_RE.test(parts[1])) return true;
  return false;
}

/**
 * @param {string} key
 * @param {string} [explicit]
 * @returns {'marker'|'widget'|'searches'|'other'}
 */
function kindFromKey(key, explicit) {
  if (explicit && KINDS.has(explicit)) return /** @type {'marker'|'widget'|'searches'|'other'} */ (explicit);
  const decoded = decodeKey(key);
  if (decoded.endsWith('/')) {
    return isHostOrGuidMarkerKey(decoded) ? 'marker' : 'other';
  }
  const base = decoded.split('/').pop() || '';
  const lower = base.toLowerCase();
  if (lower === 'widget.json') return 'widget';
  if (lower === 'searches.json') return 'searches';
  return 'other';
}

/**
 * @param {unknown} obj
 * @returns {{ key: string, etag?: string, kind?: string, host?: string }|null}
 */
function extractKey(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const rec = /** @type {Record<string, unknown>} */ (obj);
  if (rec.detail && typeof rec.detail === 'object') {
    const detail = /** @type {Record<string, unknown>} */ (rec.detail);
    const object = detail.object && typeof detail.object === 'object'
      ? /** @type {Record<string, unknown>} */ (detail.object)
      : null;
    if (object && object.key != null) {
      return {
        key: String(object.key),
        etag: object.etag != null ? String(object.etag) : object.eTag != null ? String(object.eTag) : undefined,
      };
    }
  }
  if (Array.isArray(rec.Records) && rec.Records[0] && typeof rec.Records[0] === 'object') {
    const record = /** @type {Record<string, unknown>} */ (rec.Records[0]);
    const s3 = record.s3 && typeof record.s3 === 'object'
      ? /** @type {Record<string, unknown>} */ (record.s3)
      : null;
    const object = s3 && s3.object && typeof s3.object === 'object'
      ? /** @type {Record<string, unknown>} */ (s3.object)
      : null;
    if (object && object.key != null) {
      return {
        key: String(object.key),
        etag: object.eTag != null ? String(object.eTag) : object.etag != null ? String(object.etag) : undefined,
      };
    }
  }
  if (typeof rec.Message === 'string' && rec.Message.trim().startsWith('{')) {
    try {
      return extractKey(JSON.parse(rec.Message));
    } catch {
      return null;
    }
  }
  if (rec.key != null) {
    return {
      key: String(rec.key),
      etag: rec.etag != null ? String(rec.etag) : rec.eTag != null ? String(rec.eTag) : undefined,
      kind: rec.kind != null ? String(rec.kind) : undefined,
      host: rec.host != null ? String(rec.host) : undefined,
    };
  }
  return null;
}

/**
 * Parse an EventBridge S3 event, a legacy S3 Records notification, or compact JSON.
 * Returns null when the key is excluded (IN/ or search-fanout.json).
 * @param {unknown} raw
 * @returns {{ hostkey: string, guid?: string, kind: 'marker'|'widget'|'searches'|'other', key: string, etag?: string, host?: string }|null}
 */
function parseChangeEvent(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      const err = new Error('invalid_change_event_json');
      err.code = 'invalid_change_event_json';
      throw err;
    }
  }
  if (!obj || typeof obj !== 'object') {
    const err = new Error('invalid_change_event');
    err.code = 'invalid_change_event';
    throw err;
  }
  const extracted = extractKey(obj);
  if (!extracted || !extracted.key) {
    const err = new Error('invalid_change_event');
    err.code = 'invalid_change_event';
    throw err;
  }
  const key = decodeKey(extracted.key);
  if (!key) {
    const err = new Error('invalid_change_event');
    err.code = 'invalid_change_event';
    throw err;
  }
  if (isExcludedKey(key)) return null;
  const { hostkey, guid } = hostGuidFromKey(key);
  if (!hostkey) {
    const err = new Error('change_event_host_required');
    err.code = 'change_event_host_required';
    throw err;
  }
  const kind = kindFromKey(key, extracted.kind);
  const etag = extracted.etag ? normEtag(extracted.etag) : '';
  const out = { hostkey, kind, key };
  if (guid) out.guid = guid;
  if (etag) out.etag = etag;
  if (extracted.host) out.host = extracted.host;
  return out;
}

module.exports = {
  decodeKey,
  normEtag,
  isExcludedKey,
  isHostOrGuidMarkerKey,
  parseChangeEvent,
  hostGuidFromKey,
  kindFromKey,
};
