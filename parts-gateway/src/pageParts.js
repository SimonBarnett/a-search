'use strict';

/**
 * FR #3968 / #4891: S3 a-clubs backed GET /parts page (auto-create host + GUID).
 * Host from Origin only. Returns status searching|ok|no_parts from enabled flag.
 * Does NOT promote IN/ → live.json (FR #5270: agent / hasresults monitor only).
 */

const { assertWidgetGuid } = require('../../shared/widgets/widgetPath');
const { partsResponseLeaksSecrets } = require('../../shared/widgets/hostFolderMeta');
const { ensureAclubsHost } = require('./ensureHost');
const { ensureAclubsWidget } = require('./ensureWidget');
const { widgetFileKey } = require('./aClubsKeys');
const { requireHostFromOrigin } = require('./originHost');

const SEARCHING_RETRY_AFTER_MS = 5000;

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
 * @param {unknown} raw
 * @returns {0|1}
 */
function parseEnabledFlag(raw) {
  return raw === 1 || raw === '1' ? 1 : 0;
}

/** @deprecated FR #4891: use parseEnabledFlag */
function parseInitFlag(raw) {
  return parseEnabledFlag(raw);
}

/**
 * @param {{
 *   origin?: string,
 *   widgetGuid: string,
 *   offset?: number|string,
 *   n?: number|string,
 *   layout?: string,
 *   referer?: string,
 *   pageUri?: string,
 *   uri?: string,
 *   host?: string,
 *   headObject: Function,
 *   putObject: Function,
 *   getObject: Function,
 *   listObjectsV2?: Function,
 *   putObjectTagging?: Function,
 *   getObjectTagging?: Function,
 *   copyObject?: Function,
 *   getObjectAnnotation?: Function,
 *   mint?: () => string,
 *   sendMessage?: Function,
 *   folderEventsQueueUrl?: string,
 *   now?: Date|string|number,
 * }} opts
 */
async function pagePartsAclubs(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new PartsError('parts_opts_required');
  }

  // Host from Origin only --- ignore ?host= (FR #3968).
  // Embed frames resolve to club domain (FR #4107); never a-clubs/{filesusr}/.
  const originCheck = requireHostFromOrigin(opts.origin, opts.parentOrigin);
  if (!originCheck.ok) {
    throw new PartsError(originCheck.code);
  }
  const host = originCheck.host;

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
    now: opts.now,
  });

  const widgetInfo = await ensureAclubsWidget({
    host,
    widgetGuid: guid,
    userid: hostInfo.userid,
    layout: opts.layout,
    referer: opts.referer,
    pageUri: opts.pageUri,
    uri: opts.uri,
    headObject: opts.headObject,
    putObject: opts.putObject,
    getObject: opts.getObject,
    copyObject: opts.copyObject,
    getObjectTagging: opts.getObjectTagging,
    putObjectTagging: opts.putObjectTagging,
    sendMessage: opts.sendMessage,
    folderEventsQueueUrl: opts.folderEventsQueueUrl,
    now: opts.now,
  });

  const enabled = parseEnabledFlag(
    widgetInfo.metadata && widgetInfo.metadata.enabled,
  );

  // Create leg / not ready: searching. Do not read or write live.json promotion.
  if (enabled !== 1) {
    const response = {
      userid: hostInfo.userid,
      widgetGuid: guid,
      layout: widgetInfo.layout,
      parts: [],
      nextOffset: null,
      status: 'searching',
      retryAfterMs: SEARCHING_RETRY_AFTER_MS,
      // Compat for cached widgets that still key off init (FR #4891).
      init: 0,
      enabled: 0,
    };
    if (partsResponseLeaksSecrets(response)) {
      throw new PartsError('parts_response_secret_leak');
    }
    return response;
  }

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

  if (!live.length) {
    const response = {
      userid: hostInfo.userid,
      widgetGuid: guid,
      layout: widgetInfo.layout,
      parts: [],
      nextOffset: null,
      status: 'no_parts',
      init: 1,
      enabled: 1,
    };
    if (partsResponseLeaksSecrets(response)) {
      throw new PartsError('parts_response_secret_leak');
    }
    return response;
  }

  const slice = live.slice(offset, offset + n);
  const next = offset + n;
  const nextOffset = next < live.length ? next : null;

  const response = {
    userid: hostInfo.userid,
    widgetGuid: guid,
    layout: widgetInfo.layout,
    parts: slice,
    nextOffset,
    status: 'ok',
    init: 1,
    enabled: 1,
  };
  if (partsResponseLeaksSecrets(response)) {
    throw new PartsError('parts_response_secret_leak');
  }
  return response;
}

module.exports = {
  pagePartsAclubs,
  parseLiveBody,
  PartsError,
  parseNonNegInt,
  parseInitFlag,
  parseEnabledFlag,
  SEARCHING_RETRY_AFTER_MS,
};
