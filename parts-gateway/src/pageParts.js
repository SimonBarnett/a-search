'use strict';

/**
 * FR #3968: S3 a-clubs backed GET /parts page (auto-create host + GUID).
 */

const { normalizeHost } = require('../../shared/components/customers');
const { assertWidgetGuid } = require('../../shared/widgets/widgetPath');
const { ensureAclubsHost } = require('./ensureHost');
const { ensureAclubsWidget } = require('./ensureWidget');
const { widgetFileKey, widgetInPrefix } = require('./aClubsKeys');
const { assertHostMatchesOrigin } = require('./originHost');

class PartsError extends Error {
  /**
   * @param {string} code
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message || code);
    this.name = 'PartsError';
    this.code = code;
  }
}

/**
 * @param {unknown} raw
 * @param {number} fallback
 * @returns {number}
 */
function parseNonNegInt(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    throw new PartsError('invalid_offset_or_n');
  }
  return n;
}

/**
 * @param {unknown} body
 * @returns {object[]}
 */
function parseLiveBody(body) {
  if (body == null) return [];
  let text;
  if (Buffer.isBuffer(body)) text = body.toString('utf8');
  else if (typeof body === 'string') text = body;
  else if (typeof body.transformToString === 'function') {
    // async path handled by caller
    return [];
  } else {
    text = String(body);
  }
  try {
    const raw = JSON.parse(text);
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/**
 * @param {{
 *   host: string,
 *   widgetGuid: string,
 *   offset?: number|string,
 *   n?: number|string,
 *   origin?: string,
 *   layout?: string,
 *   headObject: Function,
 *   putObject: Function,
 *   getObject: Function,
 *   listObjectsV2?: Function,
 *   putObjectTagging?: Function,
 *   mint?: () => string,
 * }} opts
 */
async function pagePartsAclubs(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new PartsError('parts_opts_required');
  }

  const originCheck = assertHostMatchesOrigin(opts.host, opts.origin);
  if (!originCheck.ok) {
    throw new PartsError(originCheck.code);
  }

  if (opts.host == null || String(opts.host).trim() === '') {
    throw new PartsError('host_required');
  }
  const host = normalizeHost(opts.host);

  if (opts.widgetGuid == null || String(opts.widgetGuid).trim() === '') {
    throw new PartsError('widget_guid_required');
  }
  let guid;
  try {
    guid = assertWidgetGuid(opts.widgetGuid);
  } catch {
    throw new PartsError('invalid_widget_guid');
  }

  const offset = parseNonNegInt(opts.offset, 0);
  const n = parseNonNegInt(opts.n, 10);
  if (n === 0) {
    throw new PartsError('invalid_offset_or_n');
  }

  const hostInfo = await ensureAclubsHost({
    host,
    headObject: opts.headObject,
    putObject: opts.putObject,
    putObjectTagging: opts.putObjectTagging,
    mint: opts.mint,
    sendMessage: opts.sendMessage,
    folderEventsQueueUrl: opts.folderEventsQueueUrl,
  });

  const widgetInfo = await ensureAclubsWidget({
    host,
    widgetGuid: guid,
    customerNumber: hostInfo.customerNumber,
    layout: opts.layout,
    referer: opts.referer,
    pageUri: opts.pageUri,
    uri: opts.uri,
    headObject: opts.headObject,
    putObject: opts.putObject,
    sendMessage: opts.sendMessage,
    folderEventsQueueUrl: opts.folderEventsQueueUrl,
  });

  const liveKey = widgetFileKey(host, guid, 'live.json');
  let live = [];
  try {
    const obj = await opts.getObject({ Key: liveKey });
    let body = obj && (obj.Body != null ? obj.Body : obj.body);
    if (body && typeof body.transformToString === 'function') {
      body = await body.transformToString();
    }
    live = parseLiveBody(body);
  } catch (err) {
    const status = err && err.$metadata && err.$metadata.httpStatusCode;
    const code = err && (err.name || err.code);
    if (status !== 404 && code !== 'NoSuchKey' && code !== 'NotFound') {
      throw err;
    }
  }

  // Optionally fold walrus IN/*.json result objects after live.json (FR #3968)
  if (typeof opts.listObjectsV2 === 'function') {
    try {
      const listed = await opts.listObjectsV2({
        Prefix: widgetInPrefix(host, guid),
      });
      const contents = (listed && listed.Contents) || [];
      for (const c of contents) {
        if (!c || !c.Key || !String(c.Key).endsWith('.json')) continue;
        try {
          const obj = await opts.getObject({ Key: c.Key });
          let body = obj && obj.Body;
          if (body && typeof body.transformToString === 'function') {
            body = await body.transformToString();
          }
          const parsed = parseLiveBody(body);
          if (parsed.length) {
            live = live.concat(parsed);
          } else if (body) {
            const one = JSON.parse(
              Buffer.isBuffer(body) ? body.toString('utf8') : String(body),
            );
            if (one && typeof one === 'object' && !Array.isArray(one)) {
              live.push(one);
            }
          }
        } catch {
          // skip bad IN objects
        }
      }
    } catch {
      // listing optional
    }
  }

  const slice = live.slice(offset, offset + n);
  const next = offset + n;
  const nextOffset = next < live.length ? next : null;

  return {
    customerNumber: hostInfo.customerNumber,
    widgetGuid: guid,
    layout: widgetInfo.layout,
    parts: slice,
    nextOffset,
  };
}

module.exports = {
  pagePartsAclubs,
  parseLiveBody,
  PartsError,
  parseNonNegInt,
};
